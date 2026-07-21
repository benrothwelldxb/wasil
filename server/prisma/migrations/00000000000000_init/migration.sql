-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARENT', 'STAFF', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "AuditResourceType" AS ENUM ('MESSAGE', 'SURVEY', 'EVENT', 'WEEKLY_MESSAGE', 'TERM_DATE', 'PULSE_SURVEY', 'YEAR_GROUP', 'CLASS', 'STAFF', 'STUDENT', 'POLICY', 'FILE', 'FOLDER', 'SCHEDULE_ITEM', 'KNOWLEDGE_CATEGORY', 'KNOWLEDGE_ARTICLE', 'SCHOOL', 'FORM', 'PARENT_INVITATION', 'GROUP', 'GROUP_CATEGORY', 'ECA_TERM', 'ECA_ACTIVITY', 'ECA_ALLOCATION', 'EMERGENCY_ALERT', 'ATTENDANCE', 'ATTENDANCE_REQUEST', 'USER');

-- CreateEnum
CREATE TYPE "EcaSchoolWeek" AS ENUM ('MON_FRI', 'SUN_THU');

-- CreateEnum
CREATE TYPE "EcaSelectionMode" AS ENUM ('FIRST_COME_FIRST_SERVED', 'SMART_ALLOCATION');

-- CreateEnum
CREATE TYPE "EcaTermStatus" AS ENUM ('DRAFT', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ALLOCATION_COMPLETE', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EcaTimeSlot" AS ENUM ('BEFORE_SCHOOL', 'AFTER_SCHOOL');

-- CreateEnum
CREATE TYPE "EcaActivityType" AS ENUM ('OPEN', 'INVITE_ONLY', 'COMPULSORY', 'TRYOUT');

-- CreateEnum
CREATE TYPE "EcaGender" AS ENUM ('MIXED', 'BOYS_ONLY', 'GIRLS_ONLY');

-- CreateEnum
CREATE TYPE "EcaAllocationType" AS ENUM ('FIRST_COME', 'SMART_PRIORITY', 'SMART_RANKED', 'SMART_REALLOCATION', 'SMART_FORCED', 'INVITED', 'COMPULSORY', 'MANUAL');

-- CreateEnum
CREATE TYPE "EcaAllocationStatus" AS ENUM ('CONFIRMED', 'WITHDRAWN', 'REMOVED');

-- CreateEnum
CREATE TYPE "EcaInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EcaTryoutResult" AS ENUM ('SUCCESSFUL', 'UNSUCCESSFUL', 'PENDING');

-- CreateEnum
CREATE TYPE "EcaAttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED', 'LATE');

-- CreateEnum
CREATE TYPE "EcaSuggestionType" AS ENUM ('INCREASE_CAPACITY', 'DECREASE_MINIMUM', 'ADD_SESSION', 'MANUAL_PLACEMENT', 'REVIEW_ACTIVITY');

-- CreateEnum
CREATE TYPE "EcaSuggestionPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "EcaSuggestionStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'BOOKING_OPEN', 'BOOKING_CLOSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOCKDOWN', 'WEATHER', 'EARLY_DISMISSAL', 'MEDICAL', 'SECURITY', 'GENERAL');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('PUSH', 'SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'PARTIAL', 'WAIVED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceRequestType" AS ENUM ('ABSENCE', 'EARLY_PICKUP', 'LATE_ARRIVAL');

-- CreateEnum
CREATE TYPE "RequestApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateEnum
CREATE TYPE "OutboxKind" AS ENUM ('EMAIL', 'PUSH', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('ECA', 'CATERING');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL DEFAULT '2025/26',
    "brandColor" TEXT NOT NULL DEFAULT '#7f0029',
    "accentColor" TEXT NOT NULL DEFAULT '#D4AF37',
    "tagline" TEXT,
    "logoUrl" TEXT,
    "logoIconUrl" TEXT,
    "paymentUrl" TEXT,
    "principalName" TEXT,
    "principalTitle" TEXT,
    "cafeteriaUrl" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "inboxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "postsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emergencyAlertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "formsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "eventsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "weeklyUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pulseEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ecaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "consultationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "schoolServicesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lunchMenuEnabled" BOOLEAN NOT NULL DEFAULT true,
    "termDatesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "policiesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "filesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "linksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "knowledgeBaseEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attendanceDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "attendanceDigestTime" TEXT,
    "attendanceDigestLastSentDate" TEXT,
    "contactConfirmDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "googleCalendarRefreshToken" TEXT,
    "googleCalendarEmail" TEXT,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARENT',
    "schoolId" TEXT NOT NULL,
    "googleId" TEXT,
    "microsoftId" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "position" TEXT,
    "phone" TEXT,
    "phoneConfirmedAt" TIMESTAMP(3),
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorRecoveryCodes" TEXT,
    "twoFactorSetupAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "externalId" TEXT,
    "photoUrl" TEXT,
    "allergies" TEXT,
    "medicalNotes" TEXT,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentStudentLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentStudentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentInvitationLink" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,

    CONSTRAINT "StudentInvitationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YearGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YearGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colorBg" TEXT NOT NULL DEFAULT 'bg-blue-500',
    "colorText" TEXT NOT NULL DEFAULT 'text-white',
    "schoolId" TEXT NOT NULL,
    "yearGroupId" TEXT,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffClassAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffClassAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetClass" TEXT NOT NULL,
    "classId" TEXT,
    "yearGroupId" TEXT,
    "groupId" TEXT,
    "schoolId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "actionType" TEXT,
    "actionLabel" TEXT,
    "actionDueDate" TIMESTAMP(3),
    "actionAmount" TEXT,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "scheduledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "formId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAcknowledgment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "location" TEXT,
    "targetClass" TEXT NOT NULL,
    "classId" TEXT,
    "yearGroupId" TEXT,
    "groupId" TEXT,
    "schoolId" TEXT NOT NULL,
    "requiresRsvp" BOOLEAN NOT NULL DEFAULT false,
    "parentEventId" TEXT,
    "recurrenceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermDate" (
    "id" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "termName" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sublabel" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "academicYear" TEXT,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "TermDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleItem" (
    "id" TEXT NOT NULL,
    "targetClass" TEXT NOT NULL,
    "classId" TEXT,
    "yearGroupId" TEXT,
    "schoolId" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "dayOfWeek" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "date" TIMESTAMP(3),
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyMessage" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyMessageHeart" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyMessageHeart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "KnowledgeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseSurvey" (
    "id" TEXT NOT NULL,
    "halfTermName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "additionalQuestionKey" TEXT,
    "customQuestions" JSONB,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PulseResponse" (
    "id" TEXT NOT NULL,
    "pulseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PulseResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER,
    "schoolId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "parentId" TEXT,
    "schoolId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "folderId" TEXT,
    "schoolId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "fields" JSONB NOT NULL,
    "targetClass" TEXT NOT NULL,
    "classIds" JSONB NOT NULL DEFAULT '[]',
    "yearGroupIds" JSONB NOT NULL DEFAULT '[]',
    "schoolId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "exportToken" TEXT,
    "exportTokenCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentInvitation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "accessCode" TEXT NOT NULL,
    "magicToken" TEXT,
    "parentEmail" TEXT,
    "parentName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildInvitationLink" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "ChildInvitationLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "resourceType" "AuditResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "changes" JSONB,
    "schoolId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "invitationId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "schoolId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentGroupLink" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentGroupLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffGroupAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "canMessage" BOOLEAN NOT NULL DEFAULT true,
    "canManage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffGroupAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalLink" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "icon" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" TEXT,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaSettings" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "selectionMode" "EcaSelectionMode" NOT NULL DEFAULT 'FIRST_COME_FIRST_SERVED',
    "schoolWeek" "EcaSchoolWeek" NOT NULL DEFAULT 'MON_FRI',
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT false,
    "showCost" BOOLEAN NOT NULL DEFAULT false,
    "maxPriorityChoices" INTEGER NOT NULL DEFAULT 1,
    "maxChoicesPerDay" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaTerm" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "termNumber" INTEGER NOT NULL,
    "academicYear" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "registrationOpens" TIMESTAMP(3) NOT NULL,
    "registrationCloses" TIMESTAMP(3) NOT NULL,
    "defaultBeforeSchoolStart" TEXT,
    "defaultBeforeSchoolEnd" TEXT,
    "defaultAfterSchoolStart" TEXT,
    "defaultAfterSchoolEnd" TEXT,
    "status" "EcaTermStatus" NOT NULL DEFAULT 'DRAFT',
    "allocationRun" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaTerm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaActivity" (
    "id" TEXT NOT NULL,
    "ecaTermId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "groupId" TEXT,
    "categoryId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "timeSlot" "EcaTimeSlot" NOT NULL,
    "customStartTime" TEXT,
    "customEndTime" TEXT,
    "location" TEXT,
    "activityType" "EcaActivityType" NOT NULL DEFAULT 'OPEN',
    "eligibleYearGroupIds" JSONB NOT NULL DEFAULT '[]',
    "eligibleGender" "EcaGender" NOT NULL DEFAULT 'MIXED',
    "minCapacity" INTEGER,
    "maxCapacity" INTEGER,
    "staffId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "cost" DOUBLE PRECISION,
    "costDescription" TEXT,
    "providerId" TEXT,
    "paymentUrl" TEXT,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaSelection" (
    "id" TEXT NOT NULL,
    "ecaTermId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "isPriority" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaAllocation" (
    "id" TEXT NOT NULL,
    "ecaTermId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "allocationType" "EcaAllocationType" NOT NULL,
    "allocationRound" INTEGER,
    "status" "EcaAllocationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaWaitlist" (
    "id" TEXT NOT NULL,
    "ecaTermId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EcaWaitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaInvitation" (
    "id" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "EcaInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invitedById" TEXT NOT NULL,
    "isTryout" BOOLEAN NOT NULL DEFAULT false,
    "tryoutResult" "EcaTryoutResult",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaAttendance" (
    "id" TEXT NOT NULL,
    "ecaTermId" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionDate" TIMESTAMP(3) NOT NULL,
    "status" "EcaAttendanceStatus" NOT NULL,
    "note" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaAllocationSuggestion" (
    "id" TEXT NOT NULL,
    "ecaTermId" TEXT NOT NULL,
    "type" "EcaSuggestionType" NOT NULL,
    "priority" "EcaSuggestionPriority" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "activityId" TEXT,
    "activityName" TEXT,
    "currentValue" INTEGER,
    "suggestedValue" INTEGER,
    "affectedCount" INTEGER,
    "status" "EcaSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaAllocationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationEvent" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TEXT NOT NULL,
    "endDate" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'DRAFT',
    "slotDuration" INTEGER NOT NULL DEFAULT 10,
    "breakDuration" INTEGER NOT NULL DEFAULT 0,
    "targetClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationTeacher" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "location" TEXT,
    "locationType" TEXT NOT NULL DEFAULT 'IN_PERSON',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationTeacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationAvailabilityWindow" (
    "id" TEXT NOT NULL,
    "consultationTeacherId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationSlot" (
    "id" TEXT NOT NULL,
    "consultationTeacherId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "date" TEXT,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConsultationSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultationBooking" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "notes" TEXT,
    "meetingLink" TEXT,
    "reminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultationBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyAlert" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "AlertType" NOT NULL DEFAULT 'GENERAL',
    "severity" "AlertSeverity" NOT NULL DEFAULT 'HIGH',
    "status" "AlertStatus" NOT NULL DEFAULT 'ACTIVE',
    "sendPush" BOOLEAN NOT NULL DEFAULT true,
    "sendSms" BOOLEAN NOT NULL DEFAULT false,
    "sendWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "sendEmail" BOOLEAN NOT NULL DEFAULT false,
    "targetClass" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdById" TEXT NOT NULL,
    "isDrill" BOOLEAN NOT NULL DEFAULT false,
    "drillName" TEXT,
    "requireAck" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertAcknowledgment" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertAcknowledgment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolService" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "details" TEXT,
    "days" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "costPerSession" DOUBLE PRECISION,
    "costPerWeek" DOUBLE PRECISION,
    "costPerTerm" DOUBLE PRECISION,
    "costDescription" TEXT,
    "costIsFrom" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "paymentMethod" TEXT,
    "paymentUrl" TEXT,
    "capacity" INTEGER,
    "eligibleClasses" TEXT,
    "eligibleYears" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'DRAFT',
    "registrationOpens" TIMESTAMP(3),
    "registrationCloses" TIMESTAMP(3),
    "serviceStarts" TEXT,
    "serviceEnds" TEXT,
    "location" TEXT,
    "staffName" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRegistration" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "notes" TEXT,
    "startDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SchoolContact" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "assignedUserId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "studentId" TEXT,
    "schoolContactId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageText" TEXT,
    "archivedByParent" BOOLEAN NOT NULL DEFAULT false,
    "archivedByStaff" BOOLEAN NOT NULL DEFAULT false,
    "mutedByParent" BOOLEAN NOT NULL DEFAULT false,
    "mutedByStaff" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "replyToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "posts" BOOLEAN NOT NULL DEFAULT true,
    "directMessages" BOOLEAN NOT NULL DEFAULT true,
    "emergencyAlerts" BOOLEAN NOT NULL DEFAULT true,
    "forms" BOOLEAN NOT NULL DEFAULT true,
    "events" BOOLEAN NOT NULL DEFAULT true,
    "weeklyUpdates" BOOLEAN NOT NULL DEFAULT true,
    "pulseSurveys" BOOLEAN NOT NULL DEFAULT true,
    "ecaUpdates" BOOLEAN NOT NULL DEFAULT true,
    "consultations" BOOLEAN NOT NULL DEFAULT true,
    "schoolServices" BOOLEAN NOT NULL DEFAULT true,
    "scheduleReminders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeteriaMenu" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "providerId" TEXT,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "title" TEXT,
    "imageUrl" TEXT,
    "orderUrl" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeteriaMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeteriaMenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL DEFAULT 'LUNCH',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dietaryTags" TEXT,
    "allergens" TEXT,
    "calories" INTEGER,
    "protein" INTEGER,
    "carbs" INTEGER,
    "fat" INTEGER,
    "price" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CafeteriaMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeteriaCategory" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeteriaCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CafeteriaCafeItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "dietaryTags" TEXT,
    "allergens" TEXT,
    "calories" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CafeteriaCafeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InclusionApiKey" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InclusionApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentIep" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "targets" JSONB NOT NULL,
    "reviewDate" TEXT,
    "keyWorker" TEXT,
    "notes" TEXT,
    "parentVisible" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentIep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentReport" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'REPORT_CARD',
    "reportPeriod" TEXT,
    "academicYear" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "notes" TEXT,
    "markedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "type" "AttendanceRequestType" NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "time" TEXT,
    "status" "RequestApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEntry" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "kind" "OutboxKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboxEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "status" "ProviderStatus" NOT NULL DEFAULT 'ACTIVE',
    "logoUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderSchoolLink" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "shareParentContact" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderSchoolLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUser" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "twoFactorSecret" TEXT,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorRecoveryCodes" TEXT,
    "twoFactorSetupAt" TIMESTAMP(3),
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderInvitation" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EcaProviderBooking" (
    "id" TEXT NOT NULL,
    "ecaActivityId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentUserId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EcaProviderBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "succeeded" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "User_microsoftId_key" ON "User"("microsoftId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "Student_schoolId_classId_idx" ON "Student"("schoolId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_externalId_key" ON "Student"("schoolId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentStudentLink_userId_studentId_key" ON "ParentStudentLink"("userId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentInvitationLink_invitationId_studentId_key" ON "StudentInvitationLink"("invitationId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "YearGroup_schoolId_name_key" ON "YearGroup"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Class_schoolId_name_key" ON "Class"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StaffClassAssignment_userId_classId_key" ON "StaffClassAssignment"("userId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_formId_key" ON "Message"("formId");

-- CreateIndex
CREATE INDEX "Message_schoolId_createdAt_idx" ON "Message"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_classId_idx" ON "Message"("classId");

-- CreateIndex
CREATE INDEX "Message_yearGroupId_idx" ON "Message"("yearGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAcknowledgment_messageId_userId_key" ON "MessageAcknowledgment"("messageId", "userId");

-- CreateIndex
CREATE INDEX "Event_schoolId_date_idx" ON "Event"("schoolId", "date");

-- CreateIndex
CREATE INDEX "Event_parentEventId_idx" ON "Event"("parentEventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRsvp_eventId_userId_key" ON "EventRsvp"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyMessageHeart_messageId_userId_key" ON "WeeklyMessageHeart"("messageId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PulseResponse_pulseId_userId_key" ON "PulseResponse"("pulseId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Form_exportToken_key" ON "Form"("exportToken");

-- CreateIndex
CREATE INDEX "Form_schoolId_status_idx" ON "Form"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FormResponse_formId_userId_key" ON "FormResponse"("formId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentInvitation_accessCode_key" ON "ParentInvitation"("accessCode");

-- CreateIndex
CREATE UNIQUE INDEX "ParentInvitation_magicToken_key" ON "ParentInvitation"("magicToken");

-- CreateIndex
CREATE INDEX "ParentInvitation_schoolId_status_idx" ON "ParentInvitation"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ParentInvitation_accessCode_idx" ON "ParentInvitation"("accessCode");

-- CreateIndex
CREATE UNIQUE INDEX "ChildInvitationLink_invitationId_classId_childName_key" ON "ChildInvitationLink"("invitationId", "classId", "childName");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_idx" ON "AuditLog"("resourceType");

-- CreateIndex
CREATE INDEX "Notification_userId_read_createdAt_idx" ON "Notification"("userId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_schoolId_idx" ON "Notification"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_userId_token_key" ON "DeviceToken"("userId", "token");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_type_idx" ON "MagicLinkToken"("email", "type");

-- CreateIndex
CREATE INDEX "MagicLinkToken_token_idx" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "LinkCategory_schoolId_order_idx" ON "LinkCategory"("schoolId", "order");

-- CreateIndex
CREATE INDEX "GroupCategory_schoolId_order_idx" ON "GroupCategory"("schoolId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "GroupCategory_schoolId_name_key" ON "GroupCategory"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Group_schoolId_isActive_idx" ON "Group"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Group_schoolId_name_key" ON "Group"("schoolId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGroupLink_studentId_groupId_key" ON "StudentGroupLink"("studentId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffGroupAssignment_userId_groupId_key" ON "StaffGroupAssignment"("userId", "groupId");

-- CreateIndex
CREATE INDEX "ExternalLink_schoolId_active_order_idx" ON "ExternalLink"("schoolId", "active", "order");

-- CreateIndex
CREATE INDEX "ExternalLink_categoryId_idx" ON "ExternalLink"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "EcaSettings_schoolId_key" ON "EcaSettings"("schoolId");

-- CreateIndex
CREATE INDEX "EcaTerm_schoolId_status_idx" ON "EcaTerm"("schoolId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EcaTerm_schoolId_termNumber_academicYear_key" ON "EcaTerm"("schoolId", "termNumber", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "EcaActivity_groupId_key" ON "EcaActivity"("groupId");

-- CreateIndex
CREATE INDEX "EcaActivity_ecaTermId_dayOfWeek_timeSlot_idx" ON "EcaActivity"("ecaTermId", "dayOfWeek", "timeSlot");

-- CreateIndex
CREATE INDEX "EcaActivity_schoolId_isActive_idx" ON "EcaActivity"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "EcaActivity_providerId_idx" ON "EcaActivity"("providerId");

-- CreateIndex
CREATE INDEX "EcaSelection_ecaTermId_studentId_idx" ON "EcaSelection"("ecaTermId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "EcaSelection_ecaTermId_studentId_ecaActivityId_key" ON "EcaSelection"("ecaTermId", "studentId", "ecaActivityId");

-- CreateIndex
CREATE INDEX "EcaAllocation_ecaTermId_studentId_idx" ON "EcaAllocation"("ecaTermId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "EcaAllocation_ecaTermId_studentId_ecaActivityId_key" ON "EcaAllocation"("ecaTermId", "studentId", "ecaActivityId");

-- CreateIndex
CREATE INDEX "EcaWaitlist_ecaActivityId_position_idx" ON "EcaWaitlist"("ecaActivityId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "EcaWaitlist_ecaTermId_studentId_ecaActivityId_key" ON "EcaWaitlist"("ecaTermId", "studentId", "ecaActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "EcaInvitation_ecaActivityId_studentId_key" ON "EcaInvitation"("ecaActivityId", "studentId");

-- CreateIndex
CREATE INDEX "EcaAttendance_ecaActivityId_sessionDate_idx" ON "EcaAttendance"("ecaActivityId", "sessionDate");

-- CreateIndex
CREATE UNIQUE INDEX "EcaAttendance_ecaActivityId_studentId_sessionDate_key" ON "EcaAttendance"("ecaActivityId", "studentId", "sessionDate");

-- CreateIndex
CREATE INDEX "EcaAllocationSuggestion_ecaTermId_status_idx" ON "EcaAllocationSuggestion"("ecaTermId", "status");

-- CreateIndex
CREATE INDEX "ConsultationAvailabilityWindow_consultationTeacherId_date_idx" ON "ConsultationAvailabilityWindow"("consultationTeacherId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultationBooking_slotId_key" ON "ConsultationBooking"("slotId");

-- CreateIndex
CREATE INDEX "EmergencyAlert_schoolId_status_idx" ON "EmergencyAlert"("schoolId", "status");

-- CreateIndex
CREATE INDEX "EmergencyAlert_schoolId_createdAt_idx" ON "EmergencyAlert"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertAcknowledgment_alertId_idx" ON "AlertAcknowledgment"("alertId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertAcknowledgment_alertId_parentId_key" ON "AlertAcknowledgment"("alertId", "parentId");

-- CreateIndex
CREATE INDEX "AlertDelivery_alertId_channel_idx" ON "AlertDelivery"("alertId", "channel");

-- CreateIndex
CREATE INDEX "AlertDelivery_alertId_status_idx" ON "AlertDelivery"("alertId", "status");

-- CreateIndex
CREATE INDEX "SchoolService_schoolId_status_idx" ON "SchoolService"("schoolId", "status");

-- CreateIndex
CREATE INDEX "ServiceRegistration_parentId_idx" ON "ServiceRegistration"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRegistration_serviceId_studentId_key" ON "ServiceRegistration"("serviceId", "studentId");

-- CreateIndex
CREATE INDEX "SchoolContact_schoolId_archived_idx" ON "SchoolContact"("schoolId", "archived");

-- CreateIndex
CREATE INDEX "Conversation_parentId_archivedByParent_lastMessageAt_idx" ON "Conversation"("parentId", "archivedByParent", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_staffId_archivedByStaff_lastMessageAt_idx" ON "Conversation"("staffId", "archivedByStaff", "lastMessageAt");

-- CreateIndex
CREATE INDEX "Conversation_schoolId_idx" ON "Conversation"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_parentId_staffId_studentId_schoolContactId_key" ON "Conversation"("parentId", "staffId", "studentId", "schoolContactId");

-- CreateIndex
CREATE INDEX "ConversationMessage_conversationId_createdAt_idx" ON "ConversationMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "CafeteriaMenu_schoolId_isPublished_idx" ON "CafeteriaMenu"("schoolId", "isPublished");

-- CreateIndex
CREATE INDEX "CafeteriaMenu_providerId_idx" ON "CafeteriaMenu"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "CafeteriaMenu_schoolId_weekOf_key" ON "CafeteriaMenu"("schoolId", "weekOf");

-- CreateIndex
CREATE INDEX "CafeteriaMenuItem_menuId_dayOfWeek_idx" ON "CafeteriaMenuItem"("menuId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "CafeteriaCategory_schoolId_isActive_idx" ON "CafeteriaCategory"("schoolId", "isActive");

-- CreateIndex
CREATE INDEX "CafeteriaCafeItem_categoryId_idx" ON "CafeteriaCafeItem"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InclusionApiKey_key_key" ON "InclusionApiKey"("key");

-- CreateIndex
CREATE INDEX "InclusionApiKey_schoolId_idx" ON "InclusionApiKey"("schoolId");

-- CreateIndex
CREATE INDEX "StudentIep_studentId_idx" ON "StudentIep"("studentId");

-- CreateIndex
CREATE INDEX "StudentIep_schoolId_idx" ON "StudentIep"("schoolId");

-- CreateIndex
CREATE INDEX "StudentReport_studentId_idx" ON "StudentReport"("studentId");

-- CreateIndex
CREATE INDEX "StudentReport_schoolId_idx" ON "StudentReport"("schoolId");

-- CreateIndex
CREATE INDEX "AttendanceRecord_schoolId_date_idx" ON "AttendanceRecord"("schoolId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_idx" ON "AttendanceRecord"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_studentId_date_key" ON "AttendanceRecord"("studentId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRequest_schoolId_status_idx" ON "AttendanceRequest"("schoolId", "status");

-- CreateIndex
CREATE INDEX "AttendanceRequest_studentId_idx" ON "AttendanceRequest"("studentId");

-- CreateIndex
CREATE INDEX "AttendanceRequest_parentId_idx" ON "AttendanceRequest"("parentId");

-- CreateIndex
CREATE INDEX "OutboxEntry_status_runAfter_idx" ON "OutboxEntry"("status", "runAfter");

-- CreateIndex
CREATE INDEX "OutboxEntry_schoolId_idx" ON "OutboxEntry"("schoolId");

-- CreateIndex
CREATE INDEX "ProviderSchoolLink_schoolId_idx" ON "ProviderSchoolLink"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderSchoolLink_providerId_schoolId_key" ON "ProviderSchoolLink"("providerId", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderUser_email_key" ON "ProviderUser"("email");

-- CreateIndex
CREATE INDEX "ProviderUser_providerId_idx" ON "ProviderUser"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRefreshToken_token_key" ON "ProviderRefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderInvitation_token_key" ON "ProviderInvitation"("token");

-- CreateIndex
CREATE INDEX "ProviderInvitation_providerId_status_idx" ON "ProviderInvitation"("providerId", "status");

-- CreateIndex
CREATE INDEX "EcaProviderBooking_ecaActivityId_idx" ON "EcaProviderBooking"("ecaActivityId");

-- CreateIndex
CREATE INDEX "EcaProviderBooking_parentUserId_idx" ON "EcaProviderBooking"("parentUserId");

-- CreateIndex
CREATE INDEX "EcaProviderBooking_schoolId_idx" ON "EcaProviderBooking"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "EcaProviderBooking_ecaActivityId_studentId_key" ON "EcaProviderBooking"("ecaActivityId", "studentId");

-- CreateIndex
CREATE INDEX "JobRun_jobKey_startedAt_idx" ON "JobRun"("jobKey", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_jobKey_periodKey_key" ON "JobRun"("jobKey", "periodKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentLink" ADD CONSTRAINT "ParentStudentLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitationLink" ADD CONSTRAINT "StudentInvitationLink_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "ParentInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentInvitationLink" ADD CONSTRAINT "StudentInvitationLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YearGroup" ADD CONSTRAINT "YearGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "YearGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClassAssignment" ADD CONSTRAINT "StaffClassAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffClassAssignment" ADD CONSTRAINT "StaffClassAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "YearGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAcknowledgment" ADD CONSTRAINT "MessageAcknowledgment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAcknowledgment" ADD CONSTRAINT "MessageAcknowledgment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "YearGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermDate" ADD CONSTRAINT "TermDate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_yearGroupId_fkey" FOREIGN KEY ("yearGroupId") REFERENCES "YearGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleItem" ADD CONSTRAINT "ScheduleItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyMessage" ADD CONSTRAINT "WeeklyMessage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyMessageHeart" ADD CONSTRAINT "WeeklyMessageHeart_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "WeeklyMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyMessageHeart" ADD CONSTRAINT "WeeklyMessageHeart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeCategory" ADD CONSTRAINT "KnowledgeCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeArticle" ADD CONSTRAINT "KnowledgeArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseSurvey" ADD CONSTRAINT "PulseSurvey_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseResponse" ADD CONSTRAINT "PulseResponse_pulseId_fkey" FOREIGN KEY ("pulseId") REFERENCES "PulseSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PulseResponse" ADD CONSTRAINT "PulseResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileFolder" ADD CONSTRAINT "FileFolder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFile" ADD CONSTRAINT "SchoolFile_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "FileFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolFile" ADD CONSTRAINT "SchoolFile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentInvitation" ADD CONSTRAINT "ParentInvitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentInvitation" ADD CONSTRAINT "ParentInvitation_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentInvitation" ADD CONSTRAINT "ParentInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildInvitationLink" ADD CONSTRAINT "ChildInvitationLink_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "ParentInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildInvitationLink" ADD CONSTRAINT "ChildInvitationLink_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkCategory" ADD CONSTRAINT "LinkCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupCategory" ADD CONSTRAINT "GroupCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupLink" ADD CONSTRAINT "StudentGroupLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentGroupLink" ADD CONSTRAINT "StudentGroupLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffGroupAssignment" ADD CONSTRAINT "StaffGroupAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffGroupAssignment" ADD CONSTRAINT "StaffGroupAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "LinkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalLink" ADD CONSTRAINT "ExternalLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaSettings" ADD CONSTRAINT "EcaSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaTerm" ADD CONSTRAINT "EcaTerm_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_ecaTermId_fkey" FOREIGN KEY ("ecaTermId") REFERENCES "EcaTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GroupCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaActivity" ADD CONSTRAINT "EcaActivity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaSelection" ADD CONSTRAINT "EcaSelection_ecaTermId_fkey" FOREIGN KEY ("ecaTermId") REFERENCES "EcaTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaSelection" ADD CONSTRAINT "EcaSelection_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaSelection" ADD CONSTRAINT "EcaSelection_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaSelection" ADD CONSTRAINT "EcaSelection_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAllocation" ADD CONSTRAINT "EcaAllocation_ecaTermId_fkey" FOREIGN KEY ("ecaTermId") REFERENCES "EcaTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAllocation" ADD CONSTRAINT "EcaAllocation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAllocation" ADD CONSTRAINT "EcaAllocation_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaWaitlist" ADD CONSTRAINT "EcaWaitlist_ecaTermId_fkey" FOREIGN KEY ("ecaTermId") REFERENCES "EcaTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaWaitlist" ADD CONSTRAINT "EcaWaitlist_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaWaitlist" ADD CONSTRAINT "EcaWaitlist_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaInvitation" ADD CONSTRAINT "EcaInvitation_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaInvitation" ADD CONSTRAINT "EcaInvitation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaInvitation" ADD CONSTRAINT "EcaInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAttendance" ADD CONSTRAINT "EcaAttendance_ecaTermId_fkey" FOREIGN KEY ("ecaTermId") REFERENCES "EcaTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAttendance" ADD CONSTRAINT "EcaAttendance_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAttendance" ADD CONSTRAINT "EcaAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAttendance" ADD CONSTRAINT "EcaAttendance_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAllocationSuggestion" ADD CONSTRAINT "EcaAllocationSuggestion_ecaTermId_fkey" FOREIGN KEY ("ecaTermId") REFERENCES "EcaTerm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaAllocationSuggestion" ADD CONSTRAINT "EcaAllocationSuggestion_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationEvent" ADD CONSTRAINT "ConsultationEvent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationTeacher" ADD CONSTRAINT "ConsultationTeacher_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "ConsultationEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationTeacher" ADD CONSTRAINT "ConsultationTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationAvailabilityWindow" ADD CONSTRAINT "ConsultationAvailabilityWindow_consultationTeacherId_fkey" FOREIGN KEY ("consultationTeacherId") REFERENCES "ConsultationTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationSlot" ADD CONSTRAINT "ConsultationSlot_consultationTeacherId_fkey" FOREIGN KEY ("consultationTeacherId") REFERENCES "ConsultationTeacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationBooking" ADD CONSTRAINT "ConsultationBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "ConsultationSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultationBooking" ADD CONSTRAINT "ConsultationBooking_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAlert" ADD CONSTRAINT "EmergencyAlert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAcknowledgment" ADD CONSTRAINT "AlertAcknowledgment_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "EmergencyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertAcknowledgment" ADD CONSTRAINT "AlertAcknowledgment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "EmergencyAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolService" ADD CONSTRAINT "SchoolService_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRegistration" ADD CONSTRAINT "ServiceRegistration_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "SchoolService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRegistration" ADD CONSTRAINT "ServiceRegistration_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolContact" ADD CONSTRAINT "SchoolContact_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolContact" ADD CONSTRAINT "SchoolContact_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_schoolContactId_fkey" FOREIGN KEY ("schoolContactId") REFERENCES "SchoolContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ConversationMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationAttachment" ADD CONSTRAINT "ConversationAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ConversationMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeteriaMenu" ADD CONSTRAINT "CafeteriaMenu_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeteriaMenu" ADD CONSTRAINT "CafeteriaMenu_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeteriaMenuItem" ADD CONSTRAINT "CafeteriaMenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "CafeteriaMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeteriaCategory" ADD CONSTRAINT "CafeteriaCategory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CafeteriaCafeItem" ADD CONSTRAINT "CafeteriaCafeItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CafeteriaCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InclusionApiKey" ADD CONSTRAINT "InclusionApiKey_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentIep" ADD CONSTRAINT "StudentIep_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentIep" ADD CONSTRAINT "StudentIep_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentReport" ADD CONSTRAINT "StudentReport_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentReport" ADD CONSTRAINT "StudentReport_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentReport" ADD CONSTRAINT "StudentReport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_markedById_fkey" FOREIGN KEY ("markedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRequest" ADD CONSTRAINT "AttendanceRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboxEntry" ADD CONSTRAINT "OutboxEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSchoolLink" ADD CONSTRAINT "ProviderSchoolLink_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderSchoolLink" ADD CONSTRAINT "ProviderSchoolLink_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUser" ADD CONSTRAINT "ProviderUser_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderRefreshToken" ADD CONSTRAINT "ProviderRefreshToken_providerUserId_fkey" FOREIGN KEY ("providerUserId") REFERENCES "ProviderUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderInvitation" ADD CONSTRAINT "ProviderInvitation_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_ecaActivityId_fkey" FOREIGN KEY ("ecaActivityId") REFERENCES "EcaActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EcaProviderBooking" ADD CONSTRAINT "EcaProviderBooking_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

