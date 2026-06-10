"""Compatibility re-export layer for feature-owned ORM models."""

from .core.db_base import Base
from .features.budgeting.models import BudgetMonth, BudgetCategoryTarget, BudgetBucketTarget
from .features.classification.models import Rule, MerchantProfile, TransactionMemory, ClassificationAudit, KnowledgeBaseEntry
from .features.connectors.models import PlaidItem, PlaidAccount, PlaidTransaction, UpAccount, UpTransaction
from .features.debts.models import DebtProfile, DebtPaymentLink
from .features.fx.models import FXRate, FXRecommendation, FXBacktestRun, FXSettings
from .features.imports.models import ImportBatch, ImportRow
from .features.ledger.models import Account, Transaction, TransactionSplit, TransactionTag, Attachment
from .features.receivables.models import Client, Invoice, InvoiceLineItem, ArchivedInvoice, InvoicePaymentLink, ArchivedInvoicePaymentLink
from .features.settings.models import AppSetting
from .features.taxonomy.models import Category, Subcategory, Tag
from .features.timesheets.models import Project, Task, TimeEntry

__all__ = [
    'Base',
    'BudgetMonth',
    'BudgetCategoryTarget',
    'BudgetBucketTarget',
    'Rule',
    'MerchantProfile',
    'TransactionMemory',
    'ClassificationAudit',
    'KnowledgeBaseEntry',
    'PlaidItem',
    'PlaidAccount',
    'PlaidTransaction',
    'UpAccount',
    'UpTransaction',
    'DebtProfile',
    'DebtPaymentLink',
    'FXRate',
    'FXRecommendation',
    'FXBacktestRun',
    'FXSettings',
    'ImportBatch',
    'ImportRow',
    'Account',
    'Transaction',
    'TransactionSplit',
    'TransactionTag',
    'Attachment',
    'Client',
    'Invoice',
    'InvoiceLineItem',
    'ArchivedInvoice',
    'InvoicePaymentLink',
    'ArchivedInvoicePaymentLink',
    'AppSetting',
    'Category',
    'Subcategory',
    'Tag',
    'Project',
    'Task',
    'TimeEntry',
]
