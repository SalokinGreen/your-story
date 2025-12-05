"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/misc/AuthContext";
import { Comment } from "@/app/misc/structs";
import { useNotification } from "@/app/misc/NotificationContext";
import { supabase } from "@/app/misc/supabase";
import ConfirmDialog from "@/app/components/ConfirmDialog";
import { DynamicIcon } from "./DynamicIcon";

interface CommentsProps {
  adventureId: string;
  initialComments?: Comment[];
}

export default function Comments({
  adventureId,
  initialComments = [],
}: CommentsProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "likes">("newest");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    icon?: string;
    confirmText?: string;
    cancelText?: string;
    confirmButtonClass?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Fetch comments from API
  useEffect(() => {
    fetchComments();
  }, [adventureId, sortBy]);

  const fetchComments = async () => {
    try {
      const response = await fetch(
        `/api/comments?adventureId=${adventureId}&sortBy=${sortBy}`
      );
      if (response.ok) {
        const data = await response.json();
        console.log("Fetched comments:", data.comments);
        setComments(
          data.comments.map((c: any) => ({
            ...c,
            createdAt: new Date(c.created_at),
            updatedAt: c.updated_at ? new Date(c.updated_at) : undefined,
            adventureId: c.adventure_id,
            userId: c.user_id,
            userName: c.user_name,
            userAvatar: c.user_avatar,
            likedBy: c.liked_by || [],
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      addNotification("Please sign in to comment", "warning");
      return;
    }

    if (!newComment.trim() && !rating) {
      addNotification("Please add a comment or rating", "warning");
      return;
    }

    setSubmitting(true);

    try {
      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to comment", "warning");
        setSubmitting(false);
        return;
      }

      // Fetch user's profile to get avatar
      const profileResponse = await fetch(`/api/profiles/${user.id}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      let userAvatar = null;
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        userAvatar = profileData.avatar_url || null;
      }

      const userName =
        user.user_metadata?.display_name ||
        user.email?.split("@")[0] ||
        "Anonymous";

      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          adventureId,
          userName,
          userAvatar,
          content: newComment.trim(),
          rating: rating || undefined,
        }),
      });

      console.log("User metadata:", user.user_metadata);
      console.log("Avatar URL being sent:", userAvatar);

      if (response.ok) {
        setNewComment("");
        setRating(null);
        addNotification("Comment posted!", "success");
        await fetchComments(); // Refresh comments
      } else {
        const error = await response.json();
        addNotification(error.error || "Failed to post comment", "failure");
      }
    } catch (error) {
      console.error("Error posting comment:", error);
      addNotification("Failed to post comment", "failure");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLike = async (commentId: string) => {
    if (!user) {
      addNotification("Please sign in to like comments", "warning");
      return;
    }

    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    const hasLiked = comment.likedBy?.includes(user.id);
    const action = hasLiked ? "unlike" : "like";

    try {
      // Get auth token
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        addNotification("Please sign in to like comments", "warning");
        return;
      }

      const response = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });

      if (response.ok) {
        await fetchComments(); // Refresh comments
      } else {
        addNotification("Failed to update like", "failure");
      }
    } catch (error) {
      console.error("Error updating like:", error);
      addNotification("Failed to update like", "failure");
    }
  };

  const handleDelete = async (commentId: string) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Comment?",
      message:
        "Are you sure you want to delete this comment? This cannot be undone.",
      icon: "Trash2",
      confirmText: "Delete",
      confirmButtonClass: "bg-red-600 hover:bg-red-700",
      onConfirm: async () => {
        setConfirmDialog({ ...confirmDialog, isOpen: false });
        try {
          // Get auth token
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            addNotification("Please sign in to delete comments", "warning");
            return;
          }

          const response = await fetch(`/api/comments/${commentId}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          });

          if (response.ok) {
            addNotification("Comment deleted", "success");
            await fetchComments(); // Refresh comments
          } else {
            addNotification("Failed to delete comment", "failure");
          }
        } catch (error) {
          console.error("Error deleting comment:", error);
          addNotification("Failed to delete comment", "failure");
        }
      },
    });
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <DynamicIcon name="MessageCircle" className="w-6 h-6" /> Comments (
          {comments.length})
        </h3>
        <select
          value={sortBy}
          onChange={(e) =>
            setSortBy(e.target.value as "newest" | "oldest" | "likes")
          }
          className="px-3 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-semibold"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="likes">Most Liked</option>
        </select>
      </div>

      {/* Comment Form */}
      {user ? (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-blue-950 rounded-xl border-2 border-gray-300 dark:border-gray-600 p-6 shadow-lg"
        >
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
              Add a comment
            </label>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Share your thoughts about this adventure..."
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:border-purple-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-200 dark:focus:ring-purple-800 transition-colors resize-none"
              maxLength={500}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {newComment.length}/500
              </span>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">
              Rate this adventure (optional)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(rating === star ? null : star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  onMouseLeave={() => setHoveredStar(null)}
                  className="text-3xl transition-transform hover:scale-110 w-10 text-center flex items-center justify-center"
                >
                  {(
                    hoveredStar !== null
                      ? star <= hoveredStar
                      : star <= (rating || 0)
                  ) ? (
                    <DynamicIcon
                      name="Star"
                      className="w-8 h-8 text-yellow-500 fill-current"
                    />
                  ) : (
                    <DynamicIcon
                      name="Star"
                      className="w-8 h-8 text-gray-300 dark:text-gray-600"
                    />
                  )}
                </button>
              ))}
              {rating && (
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="ml-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || (!newComment.trim() && !rating)}
            className="w-full px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold rounded-lg transition-all shadow-md"
          >
            {submitting ? "Posting..." : rating && !newComment.trim() ? "Post Rating" : "Post Comment"}
          </button>
        </form>
      ) : (
        <div className="bg-gray-100 dark:bg-blue-950 rounded-xl border-2 border-gray-300 dark:border-gray-600 p-6 text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Sign in to leave a comment and rate this adventure
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-linear-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-lg transition-all shadow-md"
          >
            Sign In
          </a>
        </div>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 dark:border-purple-400 mx-auto"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-blue-950 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex flex-col items-center">
            <DynamicIcon
              name="MessageCircle"
              className="w-16 h-16 text-gray-400 mb-4"
            />
            <p className="text-gray-600 dark:text-gray-400 text-lg font-semibold">
              No comments yet
            </p>
            <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
              Be the first to share your thoughts!
            </p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-white dark:bg-blue-950 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-md hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      comment.userAvatar ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        comment.userName
                      )}&background=random&size=128`
                    }
                    alt={comment.userName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-purple-400"
                  />
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white">
                      {comment.userName}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(comment.createdAt)}
                    </div>
                  </div>
                </div>
                {user && user.id === comment.userId && (
                  <button
                    onClick={() => handleDelete(comment.id)}
                    className="text-red-600 hover:text-red-700 text-sm font-semibold"
                  >
                    Delete
                  </button>
                )}
              </div>

              {comment.rating && (
                <div className="mb-3 flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className="text-yellow-500">
                      {i < comment.rating! ? (
                        <DynamicIcon
                          name="Star"
                          className="w-4 h-4 fill-current"
                        />
                      ) : (
                        <DynamicIcon
                          name="Star"
                          className="w-4 h-4 text-gray-300 dark:text-gray-600"
                        />
                      )}
                    </span>
                  ))}
                </div>
              )}

              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap mb-4">
                {comment.content}
              </p>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleLike(comment.id)}
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg font-semibold text-sm transition-colors ${
                    comment.likedBy?.includes(user?.id || "")
                      ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                      : "bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                  }`}
                >
                  {comment.likedBy?.includes(user?.id || "") ? (
                    <DynamicIcon
                      name="Heart"
                      className="w-4 h-4 fill-current"
                    />
                  ) : (
                    <DynamicIcon name="Heart" className="w-4 h-4" />
                  )}{" "}
                  {comment.likes}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        icon={confirmDialog.icon}
        confirmText={confirmDialog.confirmText}
        cancelText={confirmDialog.cancelText}
        confirmButtonClass={confirmDialog.confirmButtonClass}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
