from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.python import PythonOperator

from pipelines.index_pipeline import build_candidate_index


with DAG(
    dag_id="index_build",
    start_date=datetime(2025, 1, 1),
    schedule=None,
    catchup=False,
) as dag:
    PythonOperator(
        task_id="build_candidate_index",
        python_callable=build_candidate_index,
    )
