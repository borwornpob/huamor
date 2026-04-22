from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.python import PythonOperator

from pipelines.dataset_pipeline import build_dataset_artifact


with DAG(
    dag_id="dataset_refresh",
    start_date=datetime(2025, 1, 1),
    schedule="@daily",
    catchup=False,
) as dag:
    PythonOperator(
        task_id="build_dataset_artifact",
        python_callable=build_dataset_artifact,
    )
