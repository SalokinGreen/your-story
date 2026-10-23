"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listLocalAdventures,
  deleteLocalAdventure,
  LocalAdventure,
} from "../misc/localAdventureManager";
import { DynamicIcon } from "./DynamicIcon";

export default function LocalAdventureList() {
  const router = useRouter();
  const [adventures, setAdventures] = useState<LocalAdventure[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdventures();
  }, []);

  const loadAdventures = async () => {
    try {
      const localAdventures = await listLocalAdventures();
      setAdventures(localAdventures);
    } catch (error) {
      console.error("Failed to load local adventures:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, adventureId: string) => {
    e.stopPropagation();
    if (
      confirm(
        "Are you sure you want to delete this local adventure? This cannot be undone."
      )
    ) {
      try {
        await deleteLocalAdventure(adventureId);
        await loadAdventures();
      } catch (error) {
        console.error("Failed to delete adventure:", error);
      }
    }
  };

  const handlePlay = (e: React.MouseEvent, adventureId: string) => {
    e.stopPropagation();
    // Navigate to explorer with local ID, which should handle it
    router.push(`/explorer/${adventureId}`);
  };

  const handleEdit = (e: React.MouseEvent, adventureId: string) => {
    e.stopPropagation();
    router.push(`/creator?edit=${adventureId}`);
  };

  if (loading) {
    return (
      <div className="animate-pulse h-20 bg-ys-surface rounded-lg"></div>
    );
  }

  if (adventures.length === 0) {
    return (
      <div className="text-center py-8 bg-ys-surface rounded-xl border border-ys-border">
        <p className="text-ys-muted">
          No locally saved adventures found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-ys-text flex items-center gap-2">
        <DynamicIcon name="Map" className="w-5 h-5" /> Local Adventures
      </h3>
      <div className="grid gap-4">
        {adventures.map((adv) => (
          <div
            key={adv.id}
            className="group relative bg-ys-surface p-4 rounded-xl border border-ys-border hover:border-ys-accent shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex justify-between items-start">
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={(e) => handlePlay(e, adv.id)}
              >
                <h4 className="font-bold text-ys-text truncate pr-8">
                  {adv.title}
                </h4>
                <p className="text-sm text-ys-muted mt-1">
                  {new Date(adv.updatedAt).toLocaleDateString()} •{" "}
                  {new Date(adv.updatedAt).toLocaleTimeString()}
                </p>
                <p className="text-sm text-ys-muted mt-2 line-clamp-2">
                  {adv.description}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={(e) => handleEdit(e, adv.id)}
                  className="p-2 text-ys-muted hover:text-ys-accent hover:bg-ys-accent rounded-lg transition-colors"
                  title="Edit local adventure"
                >
                  <DynamicIcon name="Edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, adv.id)}
                  className="p-2 text-ys-muted hover:text-ys-danger hover:bg-ys-danger/25 rounded-lg transition-colors"
                  title="Delete local adventure"
                >
                  <DynamicIcon name="Trash2" className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
