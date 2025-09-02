function withValidProperties(
  properties: Record<string, undefined | string | string[]>,
) {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return !!value;
    }),
  );
}

export async function GET() {
  const URL = "https://play.chessball.fun";

  return Response.json({
    accountAssociation: {
      header: "eyJmaWQiOjk2OTIwNiwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweEU0ZjE0MWIwRUIxRTYwZkMwMDk1Yjc4N2M0YTM2Njc0QzkyMzY3OTYifQ",
      payload: "eyJkb21haW4iOiJwbGF5LmNoZXNzYmFsbC5mdW4ifQ",
      signature: "MHgyMjI5MWVlNzRiNjMyMTQzMDg0ZTlmNjljMjE1MDdiODE3NmI4NTMxMTQ2YjUxMmQyOWQ4MDkwNGU2ZWU5MzgyNDY3NzJiOTFhNWUxNGVjOTM1MTg0ZTVlNTg5ZmNiNTVjZjc0MmZiYzgwNDE0NGJiZGRjMGIxNTJlMTMwZjg4ODFj"
    },
    frame: withValidProperties({
      noindex: "true",
      version: "1",
      name: "ChessBall",
      subtitle: "Play. Bet. Earn.",
      description: "Play tactical football - 2D board game, where tactic meets probability. Build your own team, play against friends and earn rewards.",
      screenshotUrls: [],
      iconUrl: "https://play.chessball.fun/icon.png",
      splashImageUrl: "https://play.chessball.fun/splash.png",
      splashBackgroundColor: "efe7d4",
      homeUrl: URL,
      webhookUrl: `${URL}/api/webhook`,
      primaryCategory: "games",
      tags: ["chess", "football", "chessball", "tactical"],
      heroImageUrl: "https://play.chessball.fun/hero.png",
      tagline: "Play now",
      ogTitle: "ChessBall",
      ogDescription: "Play ChessBall with your friends",
      ogImageUrl: "https://play.chessball.fun/hero.png",
    }),
    baseBuilder: {
      allowedAddresses: ["0xf831c2F992866D01A2d66dB807adD7EEE8980914", "0xE4f141b0EB1E60fC0095b787c4a36674C9236796"]
    }
  });
}
