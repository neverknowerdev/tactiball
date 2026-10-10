// The site is a static export, so a game page is one file that reads the id
// from the query string: /game/?id=42.
export const gameUrl = (id: bigint | number) => `/game/?id=${id}`;
