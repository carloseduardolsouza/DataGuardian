-- Add new notification types for approval workflow
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'approval_requested';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'approval_decided';

-- Critical approval request status enum
CREATE TYPE "CriticalApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'canceled');

-- Critical approval requests table
CREATE TABLE "critical_approval_requests" (
  "id" TEXT NOT NULL,
  "action" VARCHAR(120) NOT NULL,
  "action_label" VARCHAR(180),
  "resource_type" VARCHAR(80),
  "resource_id" TEXT,
  "request_reason" VARCHAR(500),
  "payload" JSONB,
  "status" "CriticalApprovalStatus" NOT NULL DEFAULT 'pending',
  "requester_user_id" TEXT NOT NULL,
  "decided_by_user_id" TEXT,
  "decision_reason" VARCHAR(500),
  "expires_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),
  CONSTRAINT "critical_approval_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "critical_approval_requests_status_created_at_idx"
  ON "critical_approval_requests"("status", "created_at" DESC);

CREATE INDEX "critical_approval_requests_requester_user_id_created_at_idx"
  ON "critical_approval_requests"("requester_user_id", "created_at" DESC);

CREATE INDEX "critical_approval_requests_action_resource_type_resource_id_idx"
  ON "critical_approval_requests"("action", "resource_type", "resource_id");

ALTER TABLE "critical_approval_requests"
  ADD CONSTRAINT "critical_approval_requests_requester_user_id_fkey"
  FOREIGN KEY ("requester_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "critical_approval_requests"
  ADD CONSTRAINT "critical_approval_requests_decided_by_user_id_fkey"
  FOREIGN KEY ("decided_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
