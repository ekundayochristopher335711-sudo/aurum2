-- Tracks how far each person has read in a discussion thread, so unread
-- badges work without a row per comment per user.

-- CreateTable
CREATE TABLE "CommentView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "targetType" "CommentTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommentView_userId_targetType_targetId_key" ON "CommentView"("userId", "targetType", "targetId");
CREATE INDEX "CommentView_userId_projectId_idx" ON "CommentView"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "CommentView" ADD CONSTRAINT "CommentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
