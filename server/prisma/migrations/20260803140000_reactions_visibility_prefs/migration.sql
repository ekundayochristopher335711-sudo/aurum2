-- Comment reactions, per-comment visibility, and per-user notification prefs

-- CreateEnum
CREATE TYPE "CommentVisibility" AS ENUM ('EVERYONE', 'MANAGERS_ONLY');

-- AlterTable: comment visibility
ALTER TABLE "Comment" ADD COLUMN "visibility" "CommentVisibility" NOT NULL DEFAULT 'EVERYONE';

-- AlterTable: notification preferences
ALTER TABLE "User" ADD COLUMN "notifyContractEvents" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "notifyComments" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CommentReaction" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommentReaction_commentId_userId_emoji_key" ON "CommentReaction"("commentId", "userId", "emoji");
CREATE INDEX "CommentReaction_commentId_idx" ON "CommentReaction"("commentId");

-- AddForeignKey
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommentReaction" ADD CONSTRAINT "CommentReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
