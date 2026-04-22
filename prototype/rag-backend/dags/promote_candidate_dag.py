from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.python import PythonOperator

from pipelines.promotion_pipeline import promote_latest_candidate


with DAG(
    dag_id="promote_candidate",
    start_date=datetime(2025, 1, 1),
    schedule=None,
    catchup=False,
) as dag:
    PythonOperator(
        task_id="promote_latest_candidate",
        python_callable=promote_latest_candidate,
    )
