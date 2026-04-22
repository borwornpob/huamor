from __future__ import annotations

from datetime import datetime

from airflow import DAG
from airflow.operators.python import PythonOperator

from pipelines.eval_pipeline import run_offline_eval


with DAG(
    dag_id="offline_eval",
    start_date=datetime(2025, 1, 1),
    schedule=None,
    catchup=False,
) as dag:
    PythonOperator(
        task_id="run_offline_eval",
        python_callable=run_offline_eval,
    )
