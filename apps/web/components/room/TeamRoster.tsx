"use client";

import { useState } from "react";
import type { RoomTeam } from "../../lib/room-ops";

export function TeamRoster({
  teams,
  busy,
  onSaved,
  onError,
}: {
  teams: RoomTeam[];
  busy: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="border border-[#B89A60]/15 p-4">
      <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#8A8674]">Teams and members</p>
      <p className="mt-1 text-[0.74rem] text-[#C9C2AD]">
        Credits are the last official reserve, or 220 starting credits if nothing is published. Names
        can be edited here. Team IDs and passwords are not changed.
      </p>
      <div className="mt-3 space-y-3">
        {teams.map((team) => (
          <TeamEditor
            key={team.teamId}
            team={team}
            busy={busy}
            onSaved={onSaved}
            onError={onError}
          />
        ))}
      </div>
    </div>
  );
}

function TeamEditor({
  team,
  busy,
  onSaved,
  onError,
}: {
  team: RoomTeam;
  busy: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(team.name);
  const [saving, setSaving] = useState(false);

  async function saveTeam() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/teams/${team.teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.ok === false) {
        onError(data.message || data.error || "Could not save the team name.");
        return;
      }
      onSaved(`Seat ${String(team.seat).padStart(2, "0")} is now ${name.trim()}.`);
    } catch {
      onError("Network error. The last known team name is unchanged.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-white/10 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[10rem] flex-1 text-[0.66rem] uppercase tracking-[0.08em] text-[#8A8674]">
          Seat {String(team.seat).padStart(2, "0")}
          {team.loginId ? ` · ${team.loginId}` : ""}
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full border border-white/10 bg-[#0B0F0D] px-2 py-1.5 text-[0.8rem] normal-case tracking-normal text-[#E3DCC8]"
          />
        </label>
        <p className="pb-1 text-[0.78rem] tabular-nums text-[#EDE8D9]">
          {team.credits.toFixed(team.credits % 1 === 0 ? 0 : 2)} cr
          <span className="ml-1 text-[0.62rem] uppercase tracking-[0.08em] text-[#8A8674]">
            {team.creditsSource === "published" ? "official" : "starting"}
          </span>
        </p>
        <button
          type="button"
          disabled={busy || saving || name.trim() === team.name}
          onClick={() => void saveTeam()}
          className="border border-[#B89A60]/40 px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.08em] text-[#D7CFB8] hover:bg-white/5 disabled:opacity-40"
        >
          Save name
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {team.members.length === 0 ? (
          <p className="text-[0.72rem] text-[#8A8674]">No members assigned yet.</p>
        ) : (
          team.members.map((member) => (
            <MemberEditor
              key={member.userId}
              teamId={team.teamId}
              member={member}
              busy={busy}
              onSaved={onSaved}
              onError={onError}
            />
          ))
        )}
      </div>
    </div>
  );
}

function MemberEditor({
  teamId,
  member,
  busy,
  onSaved,
  onError,
}: {
  teamId: string;
  member: RoomTeam["members"][number];
  busy: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState(member.displayName);
  const [memberRole, setMemberRole] = useState(member.memberRole);
  const [saving, setSaving] = useState(false);

  async function saveMember() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/members/${member.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, memberRole }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || data.ok === false) {
        onError(data.message || data.error || "Could not save the member.");
        return;
      }
      onSaved(`${displayName.trim()} saved as ${memberRole}.`);
    } catch {
      onError("Network error. The last known member record is unchanged.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[10rem] flex-1 text-[0.66rem] uppercase tracking-[0.08em] text-[#8A8674]">
        Member
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="mt-1 w-full border border-white/10 bg-[#0B0F0D] px-2 py-1.5 text-[0.8rem] normal-case tracking-normal text-[#E3DCC8]"
        />
      </label>
      <label className="text-[0.66rem] uppercase tracking-[0.08em] text-[#8A8674]">
        Role
        <select
          value={memberRole}
          onChange={(event) => setMemberRole(event.target.value as "captain" | "member")}
          className="mt-1 block border border-white/10 bg-[#0B0F0D] px-2 py-1.5 text-[0.8rem] normal-case tracking-normal text-[#E3DCC8]"
        >
          <option value="captain">Captain</option>
          <option value="member">Member</option>
        </select>
      </label>
      <button
        type="button"
        disabled={
          busy || saving || (displayName.trim() === member.displayName && memberRole === member.memberRole)
        }
        onClick={() => void saveMember()}
        className="border border-[#B89A60]/40 px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.08em] text-[#D7CFB8] hover:bg-white/5 disabled:opacity-40"
      >
        Save member
      </button>
    </div>
  );
}
