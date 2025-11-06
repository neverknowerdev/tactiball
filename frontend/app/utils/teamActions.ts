// utils/teamActions.ts
import { toast } from "react-toastify";
import { authUserWithSignature, clearCachedAuthSignature } from '@/lib/auth';

export async function createTeam(
  teamName: string,
  countryIndex: string,
  address: string,
  signMessageAsync: any
) {
  console.log("Creating team:", { teamName, countryIndex });

  // Convert country index string to number
  const countryIndexNum = parseInt(countryIndex);
  if (isNaN(countryIndexNum) || countryIndexNum <= 0) {
    throw new Error("Invalid country selection");
  }

  console.log('Creating team for address:', address);

  // Get or create authentication signature
  const authSignature = await authUserWithSignature(address, signMessageAsync);
  console.log("Authentication signature obtained:", authSignature);

  // Call the API endpoint
  const response = await fetch('/api/create-team', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      walletAddress: address,
      signature: authSignature.signature,
      message: authSignature.message,
      teamName: teamName,
      countryId: countryIndexNum
    }),
  });

  const result = await response.json();
  console.log("response", response.status, result);

  if (!response.ok || !result.success) {
    let errorMessage = "Failed to create team: " + result.error;
    if (result.errorName) {
      errorMessage += " (ERR:" + result.errorName + ")";
    }

    // Check if this is a signature verification error and automatically clear cache
    const isSignatureError = result.error && result.error.includes("Signature verification failed");

    if (isSignatureError) {
      clearCachedAuthSignature();
      console.log("Signature verification failed - cleared cached signature");
    }

    // Show error toast
    toast.error(errorMessage, {
      position: "top-center",
      autoClose: 5000,
    });

    // Show follow-up toast only for signature errors
    if (isSignatureError) {
      setTimeout(() => {
        toast.info("Your signature was cleared, try your action again to generate new", {
          position: "top-center",
          autoClose: 4000,
        });
      }, 1000);
    }

    throw new Error(errorMessage);
  }

  console.log("Team created successfully:", result);
  return result;
}