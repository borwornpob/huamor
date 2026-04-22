from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.python import PythonOperator

from pipelines.promotion_pipeline import fail_latest_candidate


with DAG(
    dag_id="rollback_candidate",
    start_date=datetime(2025, 1, 1),
    schedule=None,
    catchup=False,
) as dag:
    PythonOperator(
        task_id="fail_latest_candidate",
        python_callable=lambda: fail_latest_candidate("manual rollback requested"),
    )
