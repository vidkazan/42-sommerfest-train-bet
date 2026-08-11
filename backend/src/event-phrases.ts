type PhraseType = "departed" | "delayIncreased" | "delayUpdated" | "cancelled" | "arrived" | "leader";

const phrases: Record<PhraseType, string[]> = {
  departed: [
    "{train} has entered the delay arena",
    "{train} is officially in motion",
    "{train} has left the station — let the chaos begin",
    "{train} is underway",
    "{train} has joined the race",
  ],
  delayIncreased: [
    "{train} is getting dramatically less punctual",
    "{train} has found another minute to lose",
    "{train} is climbing the delay leaderboard",
    "{train} is making a strong case for worst punctuality",
    "{train} just unlocked another delay level",
    "{train} is refusing to respect the timetable",
  ],
  delayUpdated: [
    "{train} changed its delay strategy",
    "{train} is keeping everyone guessing",
    "{train} has adjusted its race position",
    "{train} is rewriting the timetable",
    "{train} has made a small punctuality plot twist",
  ],
  cancelled: [
    "{train} has left the race",
    "{train} has rage-quit the competition",
    "{train} is taking the express route out of the game",
    "{train} has been cancelled — no delay points awarded",
    "{train} will not be troubling the timetable today",
  ],
  arrived: [
    "{train} reached the finish line",
    "{train} has completed its delay mission",
    "{train} crossed the final stop",
    "{train} is done causing trouble",
    "{train} has delivered its final score",
  ],
  leader: [
    "{train} takes the lead",
    "{train} is now the delay champion",
    "{train} has moved into first place",
    "{train} is leading the punctuality disaster",
    "{train} has stolen the yellow jersey",
  ],
};

const stableIndex = (key: string, length: number) => {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return hash % length;
};

export const eventPhrase = (type: PhraseType, train: string, key: string) =>
  phrases[type][stableIndex(key, phrases[type].length)].replace("{train}", train);

