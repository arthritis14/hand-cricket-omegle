import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: `Privacy Policy | ${SITE_NAME}`,
  alternates: { canonical: "/privacy" },
};

// Draft written from what the code actually does. Have the contact line and
// the operator details checked before relying on it.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10" style={{ color: "var(--gc-ink)" }}>
      <h1 className="gc-display gc-display--sm">Privacy Policy</h1>
      <p className="gc-lede mt-2">Last updated: 12 October 2026</p>

      <h2 className="gc-label mt-8">Camera</h2>
      <p className="gc-lede mt-2">
        {SITE_NAME} uses your camera to read your hand. The reading happens on your device. Video
        goes straight to your opponent over a peer-to-peer connection. We do not record it and our
        servers do not receive it.
      </p>

      <h2 className="gc-label mt-8">What we store</h2>
      <p className="gc-lede mt-2">
        If you open Friends, we create an account and keep your chosen username and display name,
        your friend list and requests, and the results of matches against friends. This is stored
        with Supabase. You can ask us to delete it at any time.
      </p>

      <h2 className="gc-label mt-8">Connections and your IP address</h2>
      <p className="gc-lede mt-2">
        To connect you to another player, your IP address is shared with that player and with the
        connection services we use (PeerJS signalling, and relay servers from ExpressTURN and
        Google STUN when a direct link is not possible).
      </p>

      <h2 className="gc-label mt-8">Analytics</h2>
      <p className="gc-lede mt-2">
        We use Google Analytics to count visitors, rough location and which game modes are
        played. It sets cookies. If you are in the EU, UK or Switzerland, it only loads if you
        accept the banner, and your choice is kept in this browser. Elsewhere it runs without a
        banner.
      </p>

      <h2 className="gc-label mt-8">Who you play</h2>
      <p className="gc-lede mt-2">
        You only play video matches against people who have accepted your friend request, or
        against the computer. Anyone can send a request, so you can remove a friend at any time to
        stop them inviting you.
      </p>

      <h2 className="gc-label mt-8">Your rights and contact</h2>
      <p className="gc-lede mt-2">
        You can ask to see, correct or delete your data. Contact: [add a contact email here].
      </p>
    </main>
  );
}
