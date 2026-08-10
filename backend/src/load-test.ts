const gameId = process.argv[2];
const baseUrl = (process.argv[3] ?? process.env.API_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const userCount = Number(process.env.LOAD_TEST_USERS ?? "30");

if (!gameId) {
  console.error("Usage: npm run load-test -- <game-id> [api-base-url]");
  process.exit(1);
}

if (!Number.isInteger(userCount) || userCount < 1 || userCount > 1000) {
  console.error("LOAD_TEST_USERS must be an integer between 1 and 1000");
  process.exit(1);
}

type Train = { id: string; displayName: string };

const json = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body as T;
};

const getCookie = (response: Response): string => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookie = headers.getSetCookie?.().join(",") ?? headers.get("set-cookie");
  const participantCookie = setCookie?.match(/participant_id=[^;]+/)?.[0];
  if (!participantCookie) throw new Error(`participant cookie missing (${response.status})`);
  return participantCookie;
};

const trainsResponse = await fetch(`${baseUrl}/api/trains?gameId=${encodeURIComponent(gameId)}`);
const trains = (await json<{ trains: Train[] }>(trainsResponse)).trains;
if (trains.length === 0) {
  console.error("The game has no available trains.");
  process.exit(1);
}

const runUser = async (index: number) => {
  const username = `lt-${Date.now().toString(36)}-${index + 1}`;
  try {
    const participantResponse = await fetch(`${baseUrl}/api/participants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId, username }),
    });
    await json<{ participantId: string; username: string }>(participantResponse);
    const cookie = getCookie(participantResponse);

    const train = trains[index % trains.length];
    const betResponse = await fetch(`${baseUrl}/api/bets`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ gameId, trainId: train.id }),
    });
    await json<{ ok: true }>(betResponse);
    return { username, train: train.displayName };
  } catch (reason: unknown) {
    throw new Error(`${username}: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
};

const startedAt = Date.now();
const results = await Promise.allSettled(Array.from({ length: userCount }, (_, index) => runUser(index)));
const successful = results.filter((result): result is PromiseFulfilledResult<{ username: string; train: string }> => result.status === "fulfilled");
const failed = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

console.log(`Load test finished in ${Date.now() - startedAt} ms`);
console.log(`Successful bets: ${successful.length}/${userCount}`);
if (failed.length > 0) {
  console.error("Failures:");
  for (const failure of failed) console.error(`- ${failure.reason instanceof Error ? failure.reason.message : String(failure.reason)}`);
  process.exitCode = 1;
}
