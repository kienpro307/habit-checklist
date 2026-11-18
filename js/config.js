// Where the shared data lives: a PRIVATE repo, separate from this public site.
// The access token (fine-grained, this repo only, Contents read/write) is entered once per phone
// and kept in that phone's browser; it is never part of the site.
export const DATA_REPO = { owner: "kienpro307", repo: "habit-checklist-data", path: "data.json" };
