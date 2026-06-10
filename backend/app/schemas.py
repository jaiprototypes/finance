"""Compatibility re-export layer for feature-owned API schemas."""

from .features.assistant.schemas import AssistantSearchRequest
from .features.budgeting.schemas import BudgetMonthCreate, BudgetCategoryTargetCreate, BudgetCategoryTargetOut, BudgetBucketTargetCreate, BudgetBucketTargetOut
from .features.classification.schemas import RuleCreate, RuleOut, MerchantProfileCreate, MerchantProfileOut, MerchantProfileUpdate, KnowledgeBaseCreate, KnowledgeBaseOut, TransactionClassifyRequest, ClassificationResult, BulkClassifyRequest
from .features.debts.schemas import DebtProfileCreate, DebtProfileOut, DebtPaymentLinkCreate, PayoffDebt, PayoffRequest
from .features.fx.schemas import FXRateCreate, FXRecommendRequest, FXSettingsUpdate
from .features.ledger.schemas import AccountBase, AccountCreate, AccountOut, TransactionBase, TransactionCreate, TransactionUpdate, TransactionOut, TransactionSplitCreate, TransactionSplitUpdate, ReconcileUpdate, MergeTransactionsRequest
from .features.receivables.schemas import ClientCreate, ClientOut, InvoiceLineItemCreate, InvoiceCreate, InvoiceOut, ArchivedInvoiceOut, ArchivedInvoiceUpdate, InvoiceSendRequest, InvoicePaymentApply, ArchivedInvoicePaymentLinkOut, ReceiptCandidateOut, ArchivedInvoiceDetailOut
from .features.settings.schemas import SettingsUpdate
from .features.taxonomy.schemas import CategoryCreate, SubcategoryCreate, SubcategoryOut, CategoryOut
from .features.timesheets.schemas import InvoiceFromTimeRequest, ProjectCreate, ProjectOut, TaskCreate, TaskOut, TimeEntryCreate, TimeEntryOut

__all__ = [
    'AssistantSearchRequest',
    'BudgetMonthCreate',
    'BudgetCategoryTargetCreate',
    'BudgetCategoryTargetOut',
    'BudgetBucketTargetCreate',
    'BudgetBucketTargetOut',
    'RuleCreate',
    'RuleOut',
    'MerchantProfileCreate',
    'MerchantProfileOut',
    'MerchantProfileUpdate',
    'KnowledgeBaseCreate',
    'KnowledgeBaseOut',
    'TransactionClassifyRequest',
    'ClassificationResult',
    'BulkClassifyRequest',
    'DebtProfileCreate',
    'DebtProfileOut',
    'DebtPaymentLinkCreate',
    'PayoffDebt',
    'PayoffRequest',
    'FXRateCreate',
    'FXRecommendRequest',
    'FXSettingsUpdate',
    'AccountBase',
    'AccountCreate',
    'AccountOut',
    'TransactionBase',
    'TransactionCreate',
    'TransactionUpdate',
    'TransactionOut',
    'TransactionSplitCreate',
    'TransactionSplitUpdate',
    'ReconcileUpdate',
    'MergeTransactionsRequest',
    'ClientCreate',
    'ClientOut',
    'InvoiceLineItemCreate',
    'InvoiceCreate',
    'InvoiceOut',
    'ArchivedInvoiceOut',
    'ArchivedInvoiceUpdate',
    'InvoiceSendRequest',
    'InvoicePaymentApply',
    'ArchivedInvoicePaymentLinkOut',
    'ReceiptCandidateOut',
    'ArchivedInvoiceDetailOut',
    'SettingsUpdate',
    'CategoryCreate',
    'SubcategoryCreate',
    'SubcategoryOut',
    'CategoryOut',
    'InvoiceFromTimeRequest',
    'ProjectCreate',
    'ProjectOut',
    'TaskCreate',
    'TaskOut',
    'TimeEntryCreate',
    'TimeEntryOut',
]
