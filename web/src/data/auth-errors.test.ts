import { describe, expect, it } from "vitest";
import { ApiError } from "@/data/api-client";
import { authErrorMessage } from "./auth-errors";

describe("authErrorMessage", () => {
  it("maps 401 to invalid credentials copy", () => {
    expect(authErrorMessage(new ApiError(401, "x"))).toBe("Invalid e-mail or password.");
  });

  it("maps 409 to already-registered copy", () => {
    expect(authErrorMessage(new ApiError(409, "conflict"))).toBe(
      "This e-mail is already registered — try logging in.",
    );
  });

  it("maps 429 to rate-limit copy", () => {
    expect(authErrorMessage(new ApiError(429, "slow down"))).toBe(
      "Too many attempts — wait a minute and try again.",
    );
  });

  it("keeps contract messages for other statuses", () => {
    expect(authErrorMessage(new ApiError(400, "Check your e-mail and password."))).toBe(
      "Check your e-mail and password.",
    );
  });

  it("falls back to a neutral message for unknown errors", () => {
    expect(authErrorMessage(new Error("raw internals"))).toBe(
      "Could not reach iPhotos Cloud — check your connection and try again.",
    );
  });
});
