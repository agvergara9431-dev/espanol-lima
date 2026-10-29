// "Extra oefenen": checks one AI-generated exercise before it is shown. Every field it needs must be there
// (instruction, the phrase to translate or choose from, the answer, and valid options). Shared by the Worker,
// which drops incomplete exercises and asks for new ones, and the app, which never renders an incomplete one.
const filled = (s) => typeof s === "string" && s.trim().length > 0;
const low = (s) => s.trim().toLowerCase();
export function completeExercise(e) {
  if (!e || !["mc", "fill", "type"].includes(e.type)) return false;
  if (![e.q, e.prompt, e.answer, e.word].every(filled)) return false;
  if (e.type === "type") return low(e.prompt) !== low(e.answer);
  const opts = Array.isArray(e.opts) ? e.opts : [];
  if (opts.length < 3 || opts.length > 4 || !opts.every(filled) || new Set(opts.map(low)).size !== opts.length) return false;
  if (!opts.includes(e.answer)) return false;
  if (e.type === "fill") return e.prompt.includes("___");
  return !opts.map(low).includes(low(e.prompt));
}
