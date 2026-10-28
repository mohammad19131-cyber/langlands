import { describe, expect, it } from "vitest";
import { fixtureGameContext } from "./game-fixture";
import { playPayloadLeakNames, publicPlayContext } from "./play-payload";
import type { GameContext } from "./game-types";

const AUTH_USER = {
  id: "user-1",
  aud: "authenticated",
  role: "authenticated",
  email: "team-001@users.langlands.internal",
  email_confirmed_at: "2026-10-27T14:00:00.000Z",
  app_metadata: { provider: "email" },
  user_metadata: { role: "organiser" },
};

describe("public play payload", () => {
  it("keeps the seated Team ID and seat after sanitizing", () => {
    const payload = publicPlayContext(fixtureGameContext());
    expect(payload.team?.loginId).toBe("004");
    expect(payload.team?.seat).toBe(4);
    expect(payload.email).toBe("Team 004");
    expect(JSON.stringify(payload)).toContain("Team 004");
    expect(JSON.stringify(payload)).toContain('"seat":4');
  });

  it("strips a GoTrue Auth user, session, and JWT from client props", () => {
    const dirty = Object.assign(fixtureGameContext(), {
      user: AUTH_USER,
      session: {
        access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaaaaaaaaaaaaaa.bb",
        refresh_token: "secret-refresh",
        user: AUTH_USER,
      },
      email: AUTH_USER.email,
      password: "should-not-leak",
    }) as GameContext;
    expect(playPayloadLeakNames(JSON.stringify(dirty)).length).toBeGreaterThan(0);

    const payload = publicPlayContext(dirty);
    const serialized = JSON.stringify(payload);
    expect(playPayloadLeakNames(serialized)).toEqual([]);
    expect(serialized).not.toContain("users.langlands.internal");
    expect(serialized).not.toContain("email_confirmed_at");
    expect(serialized).not.toContain("access_token");
    expect(payload.email).toBe("Team 004");
    expect(payload.team?.loginId).toBe("004");
    expect(payload.team?.seat).toBe(4);
    expect("user" in payload).toBe(false);
    expect("session" in payload).toBe(false);
  });

  it("flags a GoTrue Auth cookie dumped into the RSC flight stream", () => {
    const dumped =
      '81:["sb-example-auth-token",{"name":"sb-example-auth-token","value":"base64-eyJhY2Nlc3NfdG9rZW4iOiJleUo"}]';
    expect(playPayloadLeakNames(dumped)).toEqual(
      expect.arrayContaining(["auth-token-cookie", "base64-session-cookie"]),
    );
  });

  it("does not pass an organiser Auth email when the viewer is not seated", () => {
    const ctx = fixtureGameContext();
    ctx.team = null;
    ctx.email = "organiser-local@langlands.dev";
    ctx.isOrganiser = true;
    const payload = publicPlayContext(ctx);
    expect(payload.email).toBeNull();
    expect(playPayloadLeakNames(JSON.stringify(payload))).toEqual([]);
  });

  it("keeps published standings on an unseated staff payload without a team or starts", () => {
    const ctx = fixtureGameContext();
    ctx.team = null;
    ctx.isOrganiser = true;
    ctx.email = "organiser-local@langlands.dev";
    ctx.submission = null;
    ctx.ownHistory = [];
    ctx.publishedRounds = [1];
    ctx.publishedRoundIndex = 1;
    ctx.roundSummaries = [
      { index: 1, id: "r1", status: "published" },
      { index: 2, id: "r2", status: "scheduled" },
    ];
    ctx.boardByRound = {
      1: [
        {
          seat: 1,
          name: "Seat 01",
          disqualified: false,
          published: true,
          rank: 1,
          rankDelta: null,
          snapshot: 37.38,
          final: 37.38,
          rankingScore: 37.38,
          breakdown: {
            ecology: 32,
            welfare: 45,
            economy: 45,
            resilience: 37,
            efficiency: 47,
            penalty: 2,
            snapshot: 37.38,
          },
          meanDamage: 12.4,
          isYou: false,
        },
      ],
    };
    ctx.leaderboard = ctx.boardByRound[1] ?? null;
    const payload = publicPlayContext(ctx);
    expect(payload.team).toBeNull();
    expect(payload.isOrganiser).toBe(true);
    expect(payload.publishedRounds).toEqual([1]);
    expect(payload.publishedRoundIndex).toBe(1);
    expect(payload.leaderboard?.[0]?.rankingScore).toBe(37.38);
    expect(payload.submission).toBeNull();
    expect(payload.roundSummaries.find((row) => row.index === 2)?.status).toBe("scheduled");
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/WATER_TREAT|allocations|password/);
    expect(playPayloadLeakNames(serialized)).toEqual([]);
  });

  it("keeps a seated player's published R1 result while R2 stays scheduled", () => {
    const ctx = fixtureGameContext();
    ctx.mode = "live";
    ctx.isOrganiser = false;
    ctx.team = { id: "team-001", name: "Seat 01", seat: 1, loginId: "001" };
    ctx.email = "Team 001";
    ctx.round = {
      id: "r2",
      index: 2,
      status: "scheduled",
      opensAt: null,
      closesAt: null,
      eventCode: "HEATWAVE",
      serverNow: new Date().toISOString(),
    };
    ctx.submission = null;
    ctx.publishedRounds = [1];
    ctx.publishedRoundIndex = 1;
    ctx.roundSummaries = [
      { index: 1, id: "r1", status: "published" },
      { index: 2, id: "r2", status: "scheduled" },
      { index: 3, id: "r3", status: "scheduled" },
      { index: 4, id: "r4", status: "scheduled" },
      { index: 5, id: "r5", status: "scheduled" },
      { index: 6, id: "r6", status: "scheduled" },
    ];
    ctx.ownHistory = [
      {
        roundIndex: 1,
        snapshot: 37.38,
        final: 37.38,
        penalty: 2.19,
        breakdown: {
          ecology: 32.5,
          welfare: 45.2,
          economy: 45.4,
          resilience: 37.1,
          efficiency: 47.5,
          penalty: 2.19,
          snapshot: 37.38,
        },
        ecology: 32.5,
        reserve: 954,
        population: 50000,
        air: 0,
        water_q: 0,
        soil: 0,
        bio: 0,
        pollution: 0,
        health: 0,
        services: 0,
        jobs: 0,
        economy: 0,
        fiscal: 0,
        energy: 0,
        infra: 0,
        prep: 0,
        buffer: 0,
        badges: { energyMix: "thermal-heavy", agriculture: "intensive", industry: "heavy" },
      },
    ];
    ctx.boardByRound = {
      1: [
        {
          seat: 1,
          name: "Seat 01",
          disqualified: false,
          published: true,
          rank: 1,
          rankDelta: null,
          snapshot: 37.38,
          final: 37.38,
          rankingScore: 37.38,
          breakdown: ctx.ownHistory[0]!.breakdown,
          meanDamage: 11.2,
          isYou: true,
        },
        {
          seat: 2,
          name: "Seat 02",
          disqualified: false,
          published: true,
          rank: 2,
          rankDelta: null,
          snapshot: 35.99,
          final: 35.99,
          rankingScore: 35.99,
          breakdown: {
            ecology: 31.3,
            welfare: 44.6,
            economy: 45.4,
            resilience: 37.1,
            efficiency: 47.5,
            penalty: 0,
            snapshot: 35.99,
          },
          meanDamage: 14.8,
          isYou: false,
        },
      ],
    };
    ctx.leaderboard = ctx.boardByRound[1] ?? null;
    const payload = publicPlayContext(ctx);
    expect(payload.mode).toBe("live");
    expect(payload.isOrganiser).toBe(false);
    expect(payload.team?.loginId).toBe("001");
    expect(payload.team?.seat).toBe(1);
    expect(payload.round?.index).toBe(2);
    expect(payload.round?.status).toBe("scheduled");
    expect(payload.publishedRounds).toEqual([1]);
    expect(payload.ownHistory.at(-1)?.final).toBe(37.38);
    expect(payload.leaderboard).toBeNull();
    expect(payload.boardByRound).toEqual({});
    expect(JSON.stringify(payload)).not.toMatch(/Seat 02|35\.99|"rank":2/);
    expect(payload.submission).toBeNull();
    expect(payload.roundSummaries.filter((row) => row.status === "published").map((row) => row.index)).toEqual([
      1,
    ]);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/held|submissionId|accepted submission|password/);
    expect(playPayloadLeakNames(serialized)).toEqual([]);
  });
});
