import {
  MiniAppNotificationDetails,
  type SendNotificationRequest,
  sendNotificationResponseSchema,
} from "@farcaster/frame-sdk";
import { getUserNotificationDetails } from "@/lib/notification";

const appUrl = process.env.NEXT_PUBLIC_URL || "";

type SendFrameNotificationResult =
  | {
      state: "error";
      error: unknown;
    }
  | { state: "no_token" }
  | { state: "rate_limit" }
  | { state: "success" };

export async function sendFrameNotification({
  fid,
  title,
  body,
  targetUrl,
  notificationId,
  notificationDetails,
}: {
  fid: number;
  title: string;
  body: string;
  targetUrl?: string;
  notificationId?: string;
  notificationDetails?: MiniAppNotificationDetails | null;
}): Promise<SendFrameNotificationResult> {
  if (!notificationDetails) {
    notificationDetails = await getUserNotificationDetails(fid);
  }
  if (!notificationDetails) {
    return { state: "no_token" };
  }

  const response = await fetch(notificationDetails.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      notificationId: notificationId || crypto.randomUUID(),
      title,
      body,
      targetUrl: targetUrl || appUrl,
      tokens: [notificationDetails.token],
    } satisfies SendNotificationRequest),
  });

  if (response.status !== 200) {
    const responseJson = await response.json();
    return { state: "error", error: responseJson };
  }

  const responseJson = await response.json();
  const responseBody = sendNotificationResponseSchema.safeParse(responseJson);
  
  if (responseBody.success === false) {
    return { state: "error", error: responseBody.error.errors };
  }

  if (responseBody.data.result.rateLimitedTokens.length) {
    return { state: "rate_limit" };
  }

  return { state: "success" };
}