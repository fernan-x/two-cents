/** The access token lives in memory only (research R5); it is lost when the app is killed. */
let accessToken: string | null = null;

export const tokenStore = {
  get: () => accessToken,
  set: (token: string | null) => {
    accessToken = token;
  },
};
