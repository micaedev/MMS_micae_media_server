import logging

from sqlalchemy import inspect, text

from app.database import engine

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    with engine.connect() as conn:
        insp = inspect(conn)
        if not insp.has_table("videos"):
            return
        cols = {c["name"] for c in insp.get_columns("videos")}
        if "storage_id" not in cols:
            conn.execute(
                text(
                    "ALTER TABLE videos ADD COLUMN storage_id VARCHAR(32) "
                    "NOT NULL DEFAULT 'default'"
                )
            )
            conn.commit()
            logger.info("DB: videos.storage_id eklendi")

        if not insp.has_table("storage_locations"):
            conn.execute(
                text(
                    """
                    CREATE TABLE storage_locations (
                        id VARCHAR(64) PRIMARY KEY,
                        label VARCHAR(256) NOT NULL,
                        container_path VARCHAR(1024) NOT NULL UNIQUE,
                        host_path VARCHAR(1024) NOT NULL,
                        root_id VARCHAR(64) NOT NULL
                    )
                    """
                )
            )
            conn.commit()
            logger.info("DB: storage_locations tablosu oluşturuldu")

        cols = {c["name"] for c in insp.get_columns("videos")}
        for col_name, ddl in (
            ("video_codec", "ALTER TABLE videos ADD COLUMN video_codec VARCHAR(32)"),
            ("video_fps", "ALTER TABLE videos ADD COLUMN video_fps FLOAT"),
            ("has_audio", "ALTER TABLE videos ADD COLUMN has_audio BOOLEAN"),
        ):
            if col_name not in cols:
                conn.execute(text(ddl))
                conn.commit()
                logger.info("DB: videos.%s eklendi", col_name)
