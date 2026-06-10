import { hasSupabase } from "@/lib/env";
import { MemorySafarStore } from "@/lib/store/memory";
import { SupabaseSafarStore } from "@/lib/store/supabase";
import type { SafarStore } from "@/lib/store/types";

let store: SafarStore | null = null;

export function getStore(): SafarStore {
  if (!store) {
    store = hasSupabase ? new SupabaseSafarStore() : MemorySafarStore.shared();
  }
  return store;
}

export function setStoreForTests(nextStore: SafarStore | null): void {
  store = nextStore;
}
