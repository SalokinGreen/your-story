"use client";

import { useState } from "react";
import { useAuth } from "@/app/misc/AuthContext";
import { useNotification } from "@/app/misc/NotificationContext";
import { encryptStoryData, isEncrypted } from "@/app/misc/encryption";
import { authenticatedFetch } from "@/app/misc/getAuthToken";
import { DynamicIcon } from "./DynamicIcon";

interface Story {
  id: string;
  story_name: string;
  story_data: any;
}

interface EncryptionMigrationProps {
  stories: Story[];
  onMigrationComplete: () => void;
}

export default function EncryptionMigration({
  stories,
  onMigrationComplete,
}: EncryptionMigrationProps) {
  const { user, getEncryptionPassword } = useAuth();
  const { addNotification } = useNotification();
  const [encrypting, setEncrypting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showDialog, setShowDialog] = useState(false);

  const unencryptedStories = stories.filter(
    (story) => !isEncrypted(story.story_data)
  );

  const handleEncryptAll = async () => {
    if (!user?.email) {
      addNotification("User email not available", "failure");
      return;
    }

    const password = getEncryptionPassword();
    if (!password) {
      addNotification(
        "Password not available. Please sign out and sign back in to enable encryption.",
        "warning"
      );
      return;
    }

    setEncrypting(true);
    setProgress(0);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < unencryptedStories.length; i++) {
      const story = unencryptedStories[i];
      try {
        // Encrypt the story data
        const encryptedData = await encryptStoryData(
          story.story_data,
          user.email,
          password
        );

        // Save the encrypted data
        const response = await authenticatedFetch(`/api/stories/${story.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            storyData: encryptedData,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save encrypted story");
        }

        successCount++;
      } catch (error) {
        console.error(`Failed to encrypt story ${story.id}:`, error);
        failCount++;
      }

      setProgress(((i + 1) / unencryptedStories.length) * 100);
    }

    setEncrypting(false);
    setShowDialog(false);

    if (failCount === 0) {
      addNotification(
        `Successfully encrypted ${successCount} ${
          successCount === 1 ? "story" : "stories"
        }!`,
        "success"
      );
    } else {
      addNotification(
        `Encrypted ${successCount} ${
          successCount === 1 ? "story" : "stories"
        }, ${failCount} failed`,
        "warning"
      );
    }

    onMigrationComplete();
  };

  if (unencryptedStories.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-2 border-emerald-300 dark:border-emerald-700 rounded-2xl p-6 mb-6 shadow-lg">
        <div className="flex items-start gap-4">
          <div className="text-4xl">
            <DynamicIcon
              name="Lock"
              className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              Encrypt Your Stories
            </h3>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              You have {unencryptedStories.length} unencrypted{" "}
              {unencryptedStories.length === 1 ? "story" : "stories"}. Enable
              end-to-end encryption to keep your stories truly private. Only you
              can decrypt them with your password.
            </p>
            <button
              onClick={() => setShowDialog(true)}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors shadow-md flex items-center gap-2"
            >
              <DynamicIcon name="Lock" className="w-5 h-5" /> Enable Encryption
              ({unencryptedStories.length}{" "}
              {unencryptedStories.length === 1 ? "story" : "stories"})
            </button>
          </div>
        </div>
      </div>

      {showDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-blue-950 rounded-2xl p-4 sm:p-6 md:p-8 max-w-2xl w-full shadow-2xl my-4">
            <div className="text-center mb-4 sm:mb-6">
              <div className="flex justify-center mb-3 sm:mb-4">
                <DynamicIcon
                  name="Lock"
                  className="w-12 h-12 sm:w-16 sm:h-16 text-emerald-600 dark:text-emerald-400"
                />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Enable Story Encryption
              </h2>
            </div>

            {!encrypting ? (
              <>
                <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700 rounded-xl p-3 sm:p-4 md:p-6 mb-3 sm:mb-4 md:mb-6">
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-2 sm:mb-3 flex items-center gap-2">
                    <DynamicIcon
                      name="Clipboard"
                      className="w-4 h-4 sm:w-5 sm:h-5"
                    />{" "}
                    What will happen:
                  </h3>
                  <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    <li>
                      • All {unencryptedStories.length} unencrypted{" "}
                      {unencryptedStories.length === 1 ? "story" : "stories"}{" "}
                      will be encrypted
                    </li>
                    <li>
                      • Your email and password are used as the encryption key
                    </li>
                    <li>
                      • Stories are encrypted with military-grade AES-256-GCM
                    </li>
                    <li>
                      • Only you can decrypt them with your current password
                    </li>
                    <li>• This process may take a few moments</li>
                  </ul>
                </div>

                <div className="bg-yellow-50 dark:bg-yellow-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl p-3 sm:p-4 md:p-6 mb-3 sm:mb-4 md:mb-6">
                  <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-2 sm:mb-3 flex items-center gap-2">
                    <DynamicIcon
                      name="AlertTriangle"
                      className="w-4 h-4 sm:w-5 sm:h-5"
                    />{" "}
                    Important:
                  </h3>
                  <ul className="space-y-1 sm:space-y-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                    <li>
                      • If you change your password, you won't be able to
                      decrypt old stories
                    </li>
                    <li>
                      • Keep your password safe - we cannot recover encrypted
                      stories
                    </li>
                    <li>• Encryption cannot be reversed once applied</li>
                  </ul>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
                  <button
                    onClick={() => setShowDialog(false)}
                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-200 dark:bg-gray-900 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-bold text-sm sm:text-base rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEncryptAll}
                    className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm sm:text-base rounded-lg transition-colors shadow-md flex items-center justify-center gap-2"
                  >
                    <DynamicIcon
                      name="Lock"
                      className="w-4 h-4 sm:w-5 sm:h-5"
                    />{" "}
                    Encrypt All Stories
                  </button>
                </div>
              </>
            ) : (
              <div>
                <div className="mb-6">
                  <div className="flex justify-between text-sm text-gray-700 dark:text-gray-300 mb-2">
                    <span>Encrypting stories...</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-900 rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <p className="text-center text-gray-600 dark:text-gray-400">
                  Please wait while we encrypt your stories securely...
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
