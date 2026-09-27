from collections.abc import Iterator

from sqlmodel import Session, create_engine

from . import config

engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)


def new_session() -> Session:
    # expire_on_commit=False: objects keep their values after commit, so model_dump() still sees them.
    return Session(engine, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    with new_session() as session:
        yield session
