import {
  setUserNotificationDetails,
  deleteUserNotificationDetails,
  setWalletToFidMapping,
  deleteWalletToFidMapping,
} from "@/lib/notification";
import { sendFrameNotification } from "@/lib/notification-client";
import {
  parseWebhookEvent,
  verifyAppKeyWithNeynar,
  ParseWebhookEvent,
} from "@farcaster/miniapp-node";
import { getWalletsFromFid } from "@/lib/farcaster-helpers";

const appName = process.env.NEXT_PUBLIC_ONCHAINKIT_PROJECT_NAME;

export async function POST(request: Request) {
  const requestJson = await request.json();

  try {
    // Verify the webhook event using Farcaster signatures
    const data = await parseWebhookEvent(requestJson, verifyAppKeyWithNeynar);

    const fid = data.fid;
    const eventData = data.event as any;

    switch (eventData.event) {
      case "miniapp_added":
        console.log("miniapp_added", "notificationDetails", eventData.notificationDetails);
        if (eventData.notificationDetails) {
          await setUserNotificationDetails(fid, eventData.notificationDetails);
          
          // Store wallet -> FID mapping for notifications
          const wallets = await getWalletsFromFid(fid);
          for (const wallet of wallets) {
            await setWalletToFidMapping(wallet, fid);
          }
          
          await sendFrameNotification({
            fid,
            title: `Welcome to ${appName}`,
            body: `Thank you for adding ${appName}`,
          });
        }
        break;

      case "miniapp_removed":
        console.log("miniapp_removed");
        await deleteUserNotificationDetails(fid);
        await deleteWalletToFidMapping(fid);
        break;

      case "notifications_enabled":
        console.log("notifications_enabled", eventData.notificationDetails);
        await setUserNotificationDetails(fid, eventData.notificationDetails);
        
        // Update wallet -> FID mapping
        const enabledWallets = await getWalletsFromFid(fid);
        for (const wallet of enabledWallets) {
          await setWalletToFidMapping(wallet, fid);
        }
        
        await sendFrameNotification({
          fid,
          title: `Welcome to ${appName}`,
          body: `Thank you for enabling notifications for ${appName}`,
        });
        break;

      case "notifications_disabled":
        console.log("notifications_disabled");
        await deleteUserNotificationDetails(fid);
        await deleteWalletToFidMapping(fid);
        break;

      default:
        console.log("Unknown event type:", eventData.event);
    }

    return Response.json({ success: true });

  } catch (e: unknown) {
    const error = e as ParseWebhookEvent.ErrorType;

    switch (error.name) {
      case "VerifyJsonFarcasterSignature.InvalidDataError":
      case "VerifyJsonFarcasterSignature.InvalidEventDataError":
        return Response.json(
          { success: false, error: "Invalid request data" },
          { status: 400 }
        );
      case "VerifyJsonFarcasterSignature.InvalidAppKeyError":
        return Response.json(
          { success: false, error: "Invalid app key" },
          { status: 401 }
        );
      case "VerifyJsonFarcasterSignature.VerifyAppKeyError":
        return Response.json(
          { success: false, error: "Error verifying app key" },
          { status: 500 }
        );
      default:
        return Response.json(
          { success: false, error: "Verification failed" },
          { status: 401 }
        );
    }
  }
}