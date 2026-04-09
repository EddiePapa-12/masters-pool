import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import TeamsClient from "./TeamsClient";

export const revalidate = 60;

interface EntryOption {
  team_key: number;
  team_name: string;
  entrant_name: string;
}

async function getEntries(): Promise<EntryOption[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  const { data } = await supabase
    .from("entries")
    .select("team_key, team_name, entrant_name")
    .order("team_key", { ascending: true });

  return (data ?? []) as EntryOption[];
}

interface Props {
  searchParams: { team?: string };
}

export default async function TeamsPage({ searchParams }: Props) {
  const entries = await getEntries();
  const initialTeamKey = searchParams.team
    ? parseInt(searchParams.team, 10)
    : entries[0]?.team_key ?? null;

  return <TeamsClient entries={entries} initialTeamKey={initialTeamKey} />;
}
