from __future__ import annotations

from abc import ABC, abstractmethod


class StorageProvider(ABC):
    """Private object storage interface.

    Storage keys are generated server-side; user filenames are never used as
    storage paths. Access is only via authorized short-lived references.
    """

    @abstractmethod
    def put(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    def get(self, key: str) -> bytes: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...
