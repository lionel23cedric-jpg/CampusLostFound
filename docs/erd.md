# Campus Find Database ERD

This diagram reflects the Mongoose models currently implemented in
`web/src/models`. MongoDB does not enforce relational foreign keys, but ObjectId
references and service-layer checks provide the relationships shown here.

```mermaid
erDiagram
    USER {
        ObjectId _id PK
        string email UK
        string passwordHash "private, not selected"
        string role "student staff administrator"
        string status "active suspended deactivated"
        datetime createdAt
        datetime updatedAt
    }
    PROFILE {
        ObjectId _id PK
        ObjectId userId FK,UK
        string displayName
        string preferredContactMethod
        ObjectIdArray preferredCampusLocationIds FK
        object notificationSettings
    }
    SESSION {
        ObjectId _id PK
        ObjectId userId FK
        string tokenHash UK
        datetime expiresAt "TTL index"
    }
    CATEGORY {
        ObjectId _id PK
        string name UK
        string description
        boolean isActive
    }
    CAMPUS_LOCATION {
        ObjectId _id PK
        string campusName UK
        string locationName UK
        string description
        boolean isActive
    }
    ITEM_REPORT {
        ObjectId _id PK
        ObjectId reporterId FK
        ObjectId categoryId FK
        ObjectId campusLocationId FK
        string reportType "lost or found"
        string status
        string moderationStatus
        stringArray photoUrls
        object privacySettings
        object staffHandling "restricted fields"
    }
    PRIVATE_VERIFICATION_DETAILS {
        ObjectId _id PK
        ObjectId reportId FK,UK
        string serialNumber "private"
        string exactLocationDetails "private"
        objectArray verificationQuestions "answers private"
    }
    REPORT_IMAGE {
        ObjectId _id PK
        ObjectId reportId FK
        ObjectId uploadedByUserId FK
        string uploadKey UK
        string contentType
        number byteLength
        buffer data "private binary"
    }
    CLAIM {
        ObjectId _id PK
        ObjectId reportId FK
        ObjectId claimantId FK
        ObjectId reviewedBy FK
        string status
        datetime completedAt
    }
    CLAIM_EVIDENCE {
        ObjectId _id PK
        ObjectId claimId FK,UK
        objectArray responses "answers and matches private"
    }
    NOTIFICATION {
        ObjectId _id PK
        ObjectId recipientId FK
        ObjectId reportId FK
        ObjectId claimId FK
        string kind
        datetime readAt
    }
    REPORT_FLAG {
        ObjectId _id PK
        ObjectId reportId FK
        ObjectId submittedByUserId FK
        ObjectId reviewedByAdministratorId FK
        string reason
        string status
    }
    REPORT_MODERATION_EVENT {
        ObjectId _id PK
        ObjectId actorAdministratorId FK
        ObjectId reportId FK
        ObjectId sourceFlagId FK
        string action
        string reason
        datetime occurredAt
    }
    ACCOUNT_ADMINISTRATION_EVENT {
        ObjectId _id PK
        ObjectId actorAdministratorId FK
        ObjectId targetUserId FK
        string previousStatus
        string newStatus
        string reason
        datetime occurredAt
    }

    USER ||--|| PROFILE : owns
    USER ||--o{ SESSION : authenticates_with
    USER ||--o{ ITEM_REPORT : submits
    USER ||--o{ CLAIM : makes_or_reviews
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ REPORT_FLAG : submits_or_reviews
    USER ||--o{ REPORT_IMAGE : uploads
    USER ||--o{ REPORT_MODERATION_EVENT : administers
    USER ||--o{ ACCOUNT_ADMINISTRATION_EVENT : acts_or_is_targeted
    CAMPUS_LOCATION }o--o{ PROFILE : is_preferred_by
    CATEGORY ||--o{ ITEM_REPORT : classifies
    CAMPUS_LOCATION ||--o{ ITEM_REPORT : locates
    ITEM_REPORT ||--|| PRIVATE_VERIFICATION_DETAILS : protects
    ITEM_REPORT ||--o{ REPORT_IMAGE : contains
    ITEM_REPORT ||--o{ CLAIM : receives
    CLAIM ||--|| CLAIM_EVIDENCE : protects
    ITEM_REPORT ||--o{ NOTIFICATION : concerns
    CLAIM o|--o{ NOTIFICATION : concerns
    ITEM_REPORT ||--o{ REPORT_FLAG : receives
    ITEM_REPORT ||--o{ REPORT_MODERATION_EVENT : audits
    REPORT_FLAG o|--o{ REPORT_MODERATION_EVENT : originates
```

## Keys, constraints, and indexes

- User email, session token hash, profile user ID, private-verification report
  ID, and Claim-evidence Claim ID are unique.
- Category names are unique with case-insensitive English collation. Campus
  location pairs (`campusName`, `locationName`) use the same case-insensitive
  uniqueness rule.
- Reports are indexed for owner history, type/status/category/date searches,
  location/status/date searches, and weighted text search.
- Sessions have a TTL index on `expiresAt`, so MongoDB can remove expired
  sessions.
- Report-image upload keys are unique within a report, making upload retries
  idempotent.
- A partial unique report-flag index prevents the same user from holding more
  than one pending flag for the same report.
- Audit events are indexed by target/report and administrator with descending
  occurrence time.

## Historical reference policy

Categories and campus locations are deactivated rather than deleted. Existing
reports keep their ObjectId references, so historical records remain readable
while inactive reference data is excluded from new-report choices.

## Privacy boundary

`ITEM_REPORT` contains the public discovery fields and explicit privacy
settings. Ownership answers, serial numbers, and exact private locations are
stored separately in `PRIVATE_VERIFICATION_DETAILS`; submitted Claim answers
are stored separately in `CLAIM_EVIDENCE`. Sensitive fields use `select: false`
and are accessed only by the service operations that require them. Report image
binary data and uploader/upload-key fields are likewise not returned by ordinary
report queries.
