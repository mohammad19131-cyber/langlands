import { describe, expect, it } from "vitest";
import {
  DEADLINE_PASSED_MESSAGE,
  ROUND_NOT_OPEN_MESSAGE,
  submissionClosedMessage,
} from "./submission-closed";

describe("submissionClosedMessage", () => {
  it("tells a team the round is not open yet when status is scheduled", () => {
    expect(submissionClosedMessage("scheduled")).toBe(ROUND_NOT_OPEN_MESSAGE);
    expect(submissionClosedMessage("scheduled")).not.toMatch(/deadline passed/i);
  });

  it("uses the deadline copy for an open round that has expired", () => {
    expect(submissionClosedMessage("open")).toBe(DEADLINE_PASSED_MESSAGE);
  });

  it("keeps the deadline copy for locked, processing, published, and void rounds", () => {
    expect(submissionClosedMessage("locked")).toBe(DEADLINE_PASSED_MESSAGE);
    expect(submissionClosedMessage("processing")).toBe(DEADLINE_PASSED_MESSAGE);
    expect(submissionClosedMessage("published")).toBe(DEADLINE_PASSED_MESSAGE);
    expect(submissionClosedMessage("void")).toBe(DEADLINE_PASSED_MESSAGE);
  });
});
