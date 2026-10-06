export type Role = 'ADMIN' | 'COMMERCIAL_MANAGER' | 'VIEWER'
export type ContractType = 'NEC3' | 'NEC4'
export type EWStatus = 'OPEN' | 'MITIGATED' | 'CLOSED'
export type RiskStatus = 'OPEN' | 'MITIGATED' | 'CLOSED'
export type CEStatus = 'NOTIFIED' | 'QUOTED' | 'ASSESSED' | 'IMPLEMENTED' | 'CLOSED'
export type NoticeType =
  | 'EARLY_WARNING'
  | 'COMPENSATION_EVENT'
  | 'INSTRUCTION'
  | 'ACCEPTANCE'
  | 'REJECTION'
  | 'QUOTATION'
  | 'ASSESSMENT'
  | 'GENERAL'

export interface User {
  id: string
  email: string
  name: string
  role: Role
  isActive?: boolean
  createdAt: string
  notifyContractEvents?: boolean
  notifyComments?: boolean
}

export interface ProjectMember {
  id: string
  userId: string
  projectId: string
  role: Role
  user: Pick<User, 'id' | 'name' | 'email' | 'role'>
}

export interface Project {
  id: string
  name: string
  description?: string
  contractType: ContractType
  clientName?: string
  contractorName?: string
  startDate?: string
  endDate?: string
  contractValue?: number
  isActive: boolean
  createdAt: string
  updatedAt: string
  members?: ProjectMember[]
  _count?: {
    earlyWarnings: number
    compensationEvents: number
    riskItems: number
    notices: number
  }
}

export interface EarlyWarning {
  id: string
  ewNumber: string
  projectId: string
  title: string
  description: string
  raisedBy: string
  assignedTo?: string
  dateRaised: string
  dateRequired?: string
  status: EWStatus
  createdAt: string
  updatedAt: string
  riskItems?: Pick<RiskItem, 'id' | 'riskId' | 'status'>[]
}

export interface RiskItem {
  id: string
  riskId: string
  projectId: string
  earlyWarningId?: string
  description: string
  probability: number
  costImpact?: number
  timeImpact?: number
  mitigation?: string
  owner?: string
  status: RiskStatus
  createdAt: string
  updatedAt: string
  earlyWarning?: Pick<EarlyWarning, 'id' | 'ewNumber' | 'title'> | null
}

export interface CompensationEvent {
  id: string
  ceNumber: string
  projectId: string
  title: string
  description: string
  clauseRef?: string
  dateAwareness?: string
  dateNotified: string
  dateResponseDue?: string
  dateQuotationDue?: string
  valuationAmount?: number
  status: CEStatus
  notifiedBy?: string
  createdAt: string
  updatedAt: string
  notices?: Pick<Notice, 'id' | 'noticeNumber' | 'type' | 'dateIssued'>[]
  documents?: Document[]
  _count?: { notices: number; documents: number }
}

export interface Notice {
  id: string
  noticeNumber: string
  projectId: string
  ceId?: string
  type: NoticeType
  title: string
  content: string
  issuedBy: string
  issuedTo: string
  dateIssued: string
  dueDate?: string
  createdAt: string
  updatedAt: string
  ce?: Pick<CompensationEvent, 'id' | 'ceNumber' | 'title'> | null
}

export interface Document {
  id: string
  ceId: string
  name: string
  path: string
  size: number
  mimeType: string
  uploadedBy: string
  createdAt: string
}

export interface AuditLog {
  id: string
  userId: string
  projectId?: string
  entityType: string
  entityId: string
  action: string
  changes?: Record<string, { old: unknown; new: unknown }>
  ipAddress?: string
  createdAt: string
  user: Pick<User, 'name' | 'email'>
}

export interface DashboardData {
  kpis: {
    openEWs: number
    openRisks: number
    openCEs: number
    overdueCEs: number
    totalCEValue: number
    riskExposure: number
  }
  cesByStatus: { status: string; count: number }[]
  ewsByStatus: { status: string; count: number }[]
  recentActivity: {
    id: string
    action: string
    entityType: string
    entityId: string
    userName: string
    createdAt: string
  }[]
}
