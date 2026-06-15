from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey

from ...core.db_base import Base


class PlaidItem(Base):
    __tablename__ = "plaid_item"

    id = Column(Integer, primary_key=True)
    item_id = Column(String, nullable=False)
    access_token = Column(Text, nullable=False)
    institution_id = Column(String)
    institution_name = Column(String)
    status = Column(String, default="active", nullable=False)
    cursor = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class PlaidAccount(Base):
    __tablename__ = "plaid_account"

    id = Column(Integer, primary_key=True)
    item_id = Column(String, nullable=False)
    plaid_account_id = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"))
    name = Column(String)
    official_name = Column(String)
    type = Column(String)
    subtype = Column(String)
    mask = Column(String)
    currency = Column(String)
    current_balance = Column(Float)
    available_balance = Column(Float)
    balance_as_of = Column(String)
    is_active = Column(Integer, default=1, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class PlaidTransaction(Base):
    __tablename__ = "plaid_transaction"

    id = Column(Integer, primary_key=True)
    plaid_transaction_id = Column(String, nullable=False)
    pending_transaction_id = Column(String)
    account_id = Column(Integer, ForeignKey("account.id"))
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    amount = Column(Float, nullable=False)
    date = Column(String, nullable=False)
    name = Column(Text)
    merchant_name = Column(Text)
    merchant_category_code = Column(String)
    pfc_primary = Column(String)
    pfc_detailed = Column(String)
    pending = Column(Integer, default=0, nullable=False)
    created_at = Column(String, nullable=False)

class UpAccount(Base):
    __tablename__ = "up_account"

    id = Column(Integer, primary_key=True)
    up_account_id = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"))
    name = Column(String)
    account_type = Column(String)
    ownership_type = Column(String)
    currency = Column(String)
    current_balance = Column(Float)
    available_balance = Column(Float)
    balance_as_of = Column(String)
    is_active = Column(Integer, default=1, nullable=False)
    last_synced_at = Column(String)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class UpTransaction(Base):
    __tablename__ = "up_transaction"

    id = Column(Integer, primary_key=True)
    up_transaction_id = Column(String, nullable=False)
    account_id = Column(Integer, ForeignKey("account.id"))
    transaction_id = Column(Integer, ForeignKey("transactions.id"))
    status = Column(String)
    up_category_id = Column(String)
    up_category_name = Column(String)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

__all__ = ['PlaidItem', 'PlaidAccount', 'PlaidTransaction', 'UpAccount', 'UpTransaction']
