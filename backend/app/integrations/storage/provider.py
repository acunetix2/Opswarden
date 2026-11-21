from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.integrations.storage.base import StorageProvider


def _safe_key(key: str) -> str:
    # Keys are flat opaque names; strip anything that could act as a path.
    return key.replace("/", "_").replace("\\", "_").replace("..", "_")


class LocalStorageProvider(StorageProvider):
    """Private local-filesystem storage.

    Files live outside any web-served directory and are only reachable through
    authorized API endpoints. Keys are opaque and never derived from filenames.
    On hosts with an ephemeral filesystem (Render without a disk) files are lost
    on redeploy: use a persistent disk path or the S3 provider there.
    """

    def __init__(self, root: Path | None = None) -> None:
        self.root = root or settings.storage_path
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.root / _safe_key(key)

    def put(self, key: str, data: bytes) -> None:
        self._path(key).write_bytes(data)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()


class S3StorageProvider(StorageProvider):
    """Private S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO).

    Objects are written with no public ACL; the bucket must not be public. The
    API streams files to authorized users, so no presigned URLs are handed out.
    """

    def __init__(
        self,
        bucket: str,
        *,
        region: str = "auto",
        endpoint_url: str | None = None,
        access_key_id: str = "",
        secret_access_key: str = "",
        prefix: str = "",
        client=None,
    ) -> None:
        self.bucket = bucket
        self.prefix = prefix
        if client is None:
            import boto3  # imported lazily so local development doesn't need it
            from botocore.config import Config

            client = boto3.client(
                "s3",
                region_name=region or "auto",
                endpoint_url=endpoint_url or None,
                aws_access_key_id=access_key_id or None,
                aws_secret_access_key=secret_access_key or None,
                # Cloudflare R2: path-style addressing, SigV4, and checksums only when required
                # (newer boto3 sends default checksum headers that S3-compatible stores may reject).
                config=Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path"},
                    request_checksum_calculation="when_required",
                    response_checksum_validation="when_required",
                    retries={"max_attempts": 3, "mode": "standard"},
                ),
            )
        self._s3 = client

    def _key(self, key: str) -> str:
        return f"{self.prefix}{_safe_key(key)}"

    def put(self, key: str, data: bytes) -> None:
        self._s3.put_object(Bucket=self.bucket, Key=self._key(key), Body=data, ContentType="application/octet-stream")

    def get(self, key: str) -> bytes:
        obj = self._s3.get_object(Bucket=self.bucket, Key=self._key(key))
        return obj["Body"].read()

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._s3.head_object(Bucket=self.bucket, Key=self._key(key))
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise

    def delete(self, key: str) -> None:
        self._s3.delete_object(Bucket=self.bucket, Key=self._key(key))


_provider: StorageProvider | None = None


def get_storage() -> StorageProvider:
    global _provider
    if _provider is None:
        backend = settings.storage_backend.lower().strip()
        if backend == "r2":
            _provider = S3StorageProvider(
                settings.r2_bucket,
                region="auto",
                endpoint_url=settings.r2_endpoint_url,
                access_key_id=settings.r2_access_key_id,
                secret_access_key=settings.r2_secret_access_key,
                prefix=settings.r2_prefix,
            )
        elif backend == "s3":
            _provider = S3StorageProvider(
                settings.s3_bucket,
                region=settings.s3_region,
                endpoint_url=settings.s3_endpoint_url,
                access_key_id=settings.s3_access_key_id,
                secret_access_key=settings.s3_secret_access_key,
                prefix=settings.s3_prefix,
            )
        else:
            _provider = LocalStorageProvider()
    return _provider
