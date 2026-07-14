---
title: QueryDeck
emoji: 📊
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# QueryDeck

A self-hosted query console for **MySQL / PlanetScale** and **ClickHouse** in one place. Pick a database from a dropdown, write SQL with table/column autocomplete, page through results, and stream the full result set to **CSV or Excel** — no matter how large.

Built for the two problems that make ad-hoc querying painful:

- **Timeouts on big queries.** Previews are paginated, and downloads are *streamed row-block by row-block*, so the HTTP connection stays alive and memory stays flat whether a query returns a thousand rows or a billion.
- **Certificate friction.** TLS "just works" through the bundled [`certifi`](https://pypi.org/project/certifi/) CA store. You never point at a `.crt` file. Add a host, a user, and a password — that's it.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ● QueryDeck   ● CRM DB · PlanetScale  [MYSQL]          Connections    │  ← status rail
├───────────────┬──────────────────────────────────────────────────────┤
│ Schema        │  Run ⌘↵   |  Rows 200 ▾   Count · Export CSV · Excel   │
│  ▸ users   12 │ ┌──────────────────────────────────────────────────┐  │
│  ▸ orders  8  │ │ SELECT * FROM orders WHERE status = 'paid'        │  │  ← editor
│  ▸ events  20 │ └──────────────────────────────────────────────────┘  │
│               ├──────────────────────────────────────────────────────┤
│               │  200 rows · 34 ms                                     │
│               │  #  id     amount   status   created_at               │  ← results grid
│               │  1  1001   249.00   paid     2026-01-02 09:14:03      │
└───────────────┴──────────────────────────────────────────────────────┘
```

---

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Pre-loaded connections](#pre-loaded-connections)
- [Adding a connection](#adding-a-connection)
- [How large results are handled](#how-large-results-are-handled)
- [Autocomplete](#autocomplete)
- [How TLS works (no certificate files)](#how-tls-works-no-certificate-files)
- [Security](#security)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Production Deployment Guide](#production-deployment-guide)
- [Future Implementation Guide](#future-implementation-guide)
- [Tech stack](#tech-stack)

---

## Features

| | |
|---|---|
| **Two engines, one UI** | MySQL / PlanetScale / MariaDB (anything a phpMyAdmin sits on) and ClickHouse, behind a custom-designed, interactive connection dropdown. |
| **Add connections in the UI** | Enter host + credentials, **Test**, save. It appears in the dropdown immediately with detailed database meta-info (user, host, engine type) and status indicators, and is remembered across restarts. |
| **Paginated previews** | Results come back in pages (100–2000 rows). Prev/Next re-run with `LIMIT/OFFSET` so the browser never chokes. |
| **Streaming exports** | **CSV** is truly unbounded — streamed straight to disk with a server-side cursor. **Excel (.xlsx)** is written with a streaming workbook writer. |
| **Row counting** | One click wraps your query in `COUNT(*)` to tell you the true total without fetching it. |
| **SQL autocomplete** | Table and column suggestions as you type, sourced live from the selected database's schema. |
| **Schema browser** | Filterable tree of tables → columns in the sidebar. Click to insert names into the editor. |
| **Zero cert config** | Public-CA TLS via `certifi`, with automatic fall back to a plain connection for local servers, plus a "skip verification" switch for self-signed certs. |
| **Remembers your work** | Last connection and last query are restored on reload. |

---

## Requirements

- **Python 3.10+**
- Network access to your database hosts (PlanetScale on `:3306`, ClickHouse Cloud on `:8443`, etc.)

No database drivers to install by hand — `pip` handles `pymysql` and `clickhouse-connect`.

---

## Quick start

```bash
# 1. Get the code
git clone https://github.com/Swapnanil09/all_platform_large_data_mining.git
cd all_platform_large_data_mining

# 2. (recommended) create a virtual environment
python -m venv .venv
source .venv/bin/activate           # Windows: .venv\Scripts\activate

# 3. Install
pip install -r requirements.txt

# 4. Run
python run.py                       # or: python run.py --open
```

Then open **http://127.0.0.1:9001**.

Useful flags:

```bash
python run.py --port 9000           # custom port
python run.py --host 0.0.0.0        # expose on your LAN (see Security note)
python run.py --reload              # auto-reload while editing the code
python run.py --open                # open the browser automatically
```

Alternatively run the server directly:

```bash
uvicorn app:app --reload --port 9001
```

---

## Pre-loaded connections

Four connections ship ready to use and show up in the dropdown on first launch:

| Name | Engine | Host | Database |
|---|---|---|---|
| CRM DB | MySQL | `aws.connect.psdb.cloud` | `crm-db` |
| Notification / Shortlink | MySQL | `aws.connect.psdb.cloud` | `notification-shortlink-db` |
| CLIRNET DB | MySQL | `aws.connect.psdb.cloud` | `clirnetdb` |
| ClickHouse Analytics | ClickHouse | `ayz7jk0o0v.ap-south-1.aws.clickhouse.cloud` | *(empty / all databases)* |

These are defined in `db.py` under `DEFAULT_CONNECTIONS`. They're marked as **presets** and can't be deleted from the UI. To change or remove them, edit that list (and read [Security](#security) first).

---

## Adding a connection

Click **Connections** in the top-right, fill in the form, hit **Test connection**, then **Add connection**. It's saved to `connections.json` and appears in the dropdown right away.

**MySQL / PlanetScale** (also covers any MySQL a phpMyAdmin instance manages)

| Field | Notes |
|---|---|
| Host | e.g. `aws.connect.psdb.cloud` or `127.0.0.1` |
| Port | defaults to `3306` |
| User / Password | your MySQL credentials |
| Database | optional — leave blank to use the connection default |
| Use TLS | on by default; leave on for PlanetScale and other managed MySQL |

**Google Cloud SQL**

Standard drivers cannot connect directly using a GCP Instance Connection Name (`project:region:instance`). To connect:
* **Option A (via IP)**: Find the instance's **Public IP** in the Google Cloud Console, authorize your local IP address under the instance's **Authorized Networks**, and configure QueryDeck with the **Public IP** as the **Host**, and disable **Use TLS** (set `secure` to `false`).
* **Option B (via Proxy)**: Run the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/mysql/connect-auth-proxy) locally (e.g. `.\cloud-sql-proxy.exe <instance_connection_name> --port 3307`), and in QueryDeck set the **Host** to `127.0.0.1` and the **Port** to `3307`.

**ClickHouse**

| Field | Notes |
|---|---|
| Host | e.g. `xxxx.clickhouse.cloud` |
| Port | defaults to `8443` (HTTPS) or `8123` if you turn HTTPS off |
| User / Password | your ClickHouse credentials |
| Database | defaults to `default` |
| Use HTTPS | on by default for ClickHouse Cloud |

Tick **Skip certificate check** only if a host uses a self-signed certificate.

---

## How large results are handled

The whole point of QueryDeck is that a query returning enormous data never crashes the tool or times out.

**Previewing** — `POST /api/query` wraps a `SELECT`/`WITH` statement as
`SELECT * FROM (<your sql>) LIMIT <page_size + 1> OFFSET <page × page_size>`
and returns one page. The extra row tells the UI whether a **Next** page exists. Nothing beyond the current page is ever loaded into memory.

**Exporting** — `POST /api/export` never buffers the full result:

- **MySQL → CSV**: an unbuffered server-side cursor (`SSCursor`) is read in 5,000-row chunks and each chunk is written to the response as it arrives.
- **ClickHouse → CSV**: the server formats the rows as CSV (`FORMAT CSVWithNames`) and QueryDeck pipes the byte stream straight through.
- **→ Excel**: a streaming `openpyxl` write-only workbook appends rows chunk by chunk.

The browser download is submitted through a hidden `<iframe>`, so the bytes go to disk without ever sitting in the page's memory.

> **CSV vs Excel for very large data.** CSV has no row limit — use it for the big pulls. Excel (`.xlsx`) is capped by the format itself at **1,048,575 data rows**; if a query exceeds that, the export stops at the limit and adds a note sheet telling you to use CSV instead.

**Counting** — the **Count rows** button wraps your query in `COUNT(*)` and returns the true total separately, so you can see how big a result is before downloading it.

---

## Autocomplete

When you select a connection, QueryDeck loads its schema (`information_schema.columns` for MySQL, `system.columns` for ClickHouse) and feeds it to the editor. As you type an identifier, matching **table and column names** are suggested. Press **Ctrl-Space** to trigger suggestions manually. Click any table or column in the sidebar to insert its name at the cursor.

---

## How TLS works (no certificate files)

You never provide a CA file. QueryDeck uses the [`certifi`](https://pypi.org/project/certifi/) bundle — the same trusted-root set browsers use — so publicly issued certificates (PlanetScale, ClickHouse Cloud, AWS RDS, and most managed databases) validate automatically.

- **MySGL**: connects with `ssl={"ca": certifi.where()}`. If the server doesn't speak TLS at all (typical for a local MySQL), it automatically retries a plain connection.
- **ClickHouse**: connects with `secure=True` and the `certifi` CA.
- **Self-signed certs**: tick **Skip certificate check** on the connection to bypass verification while keeping the encrypted channel.

---

## Security

QueryDeck talks directly to production databases, so treat it accordingly.

- **The seeded credentials in `db.py` are real.** Anyone who has been shown this code has seen them. **Rotate any credentials that have been shared**, and move secrets out of source before committing. A clean pattern:

  ```python
  import os
  "password": os.environ["CRM_DB_PASSWORD"],   # instead of a literal
  ```

- **`connections.json` holds credentials in plain text** for connections you add in the UI. It's already listed in `.gitignore` — keep it out of version control.
- **Custom storage path:** You can configure a custom directory path for the `connections.json` file by setting the `QUERYDECK_DATA_DIR` environment variable (e.g., `QUERYDECK_DATA_DIR=/tmp`). This is particularly useful in environments like Docker or Hugging Face Spaces where write permissions to the application directory are restricted.
- **Bind to localhost.** The default `127.0.0.1` keeps QueryDeck on your machine. Only use `--host 0.0.0.0` on a trusted network, and put an auth proxy in front of it if you do — there is no built-in login.
- **Any SQL you type runs as-is**, including writes and DDL. Use a read-only database user if you only intend to read.

---

## API reference

All endpoints are same-origin JSON, except export which streams a file.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/connections` | List connections (passwords stripped). |
| `POST` | `/api/connections` | Add a connection. Body: `{name, engine, host, port, user, password, database, secure, skip_verify}`. |
| `POST` | `/api/connections/test` | Test credentials without saving. Returns `{ok, message, detail}`. |
| `DELETE` | `/api/connections/{id}` | Delete a saved connection (presets are protected). |
| `GET` | `/api/schema?conn={id}` | Tables + columns for the sidebar and autocomplete. |
| `POST` | `/api/query` | Run one page. Body: `{conn, sql, page, page_size}`. Returns `{columns, rows, has_next, page, elapsed_ms, …}`. |
| `POST` | `/api/export` | **Form POST** `{conn, sql, fmt}` where `fmt` is `csv` or `xlsx`. Streams a download. |

Interactive API docs are available at **`/docs`** (FastAPI / Swagger UI).

---

## Project structure

```
querydeck/
├── app.py               # FastAPI routes + static hosting
├── db.py                # connection manager + MySQL/ClickHouse drivers
├── run.py               # launcher (python run.py)
├── requirements.txt
├── connections.json     # created at runtime — your added connections (gitignored)
├── .gitignore
├── README.md
└── static/
    ├── index.html       # app shell
    ├── styles.css       # design system
    └── app.js           # client logic
```

---

## Troubleshooting

**"Couldn't load schema" right after selecting a connection**
The credentials or host are wrong, or the host is unreachable from your machine. Open **Connections**, edit or re-add it, and use **Test connection** for the exact error.

**Certificate / SSL error on a custom host**
The host likely uses a self-signed certificate. Edit the connection and tick **Skip certificate check**.

**Local MySQL connection fails**
QueryDeck tries TLS first and falls back to a plain connection automatically. If your server enforces something specific, uncheck **Use TLS** on the connection.

**ClickHouse or MySQL connects but shows no tables**
The sidebar lists tables in the connection's **Database** field. If a database is specified, only tables in that database are shown. If left empty, QueryDeck automatically loads all user databases and prefixes the table names in the sidebar with their database names (e.g. `database_name.table_name`).

**Excel export is smaller than expected**
The result exceeded Excel's 1,048,575-row limit and was truncated (a note sheet is included). Use **Export CSV** for the complete data.

**A query "hangs"**
Previews are capped by page size, but a heavy query (large scan, deep `OFFSET`) can still take time on the database side. Add a `WHERE`/`LIMIT`, or use **Count rows** first to gauge size.

**Autocomplete isn't suggesting anything**
It only knows tables/columns from the currently selected connection. Switch connections or hit the **⟳** refresh icon in the sidebar header. Press **Ctrl-Space** to force the popup.

---

## Production Deployment Guide

To deploy QueryDeck in a secure, stable, production-grade environment, follow these best practices:

### 1. Reverse Proxy & SSL Termination
Never expose the raw Uvicorn ASGI server directly to the public internet. Instead, place it behind Nginx, Caddy, or a cloud application load balancer.
* **SSL/TLS:** Terminate SSL at the reverse proxy level.
* **Caddy Example Configuration:**
  ```caddy
  querydeck.yourdomain.com {
      reverse_proxy localhost:9001
  }
  ```
* **Nginx Configuration Snippet:**
  ```nginx
  server {
      listen 443 ssl http2;
      server_name querydeck.yourdomain.com;

      ssl_certificate /etc/letsencrypt/live/querydeck.yourdomain.com/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/querydeck.yourdomain.com/privkey.pem;

      location / {
          proxy_pass http://127.0.0.1:9001;
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
      }
  }
  ```

### 2. Access Control & Authentication
Since QueryDeck does not have a built-in login mechanism, you must secure the application layer:
* **OAuth2 / OIDC Proxy:** Run a proxy like [oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy) in front of the application to integrate with Google Workspace, Okta, GitHub, or Active Directory.
* **Basic Auth:** If OAuth is not feasible, configure Basic Authentication at the Nginx/Caddy proxy level.

### 3. ASGI Process Management & Scaling
For production workloads, wrap Uvicorn with **Gunicorn** to handle worker management, process restarts, and multiple CPU cores:
```bash
pip install gunicorn
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:9001
```
* Adjust the number of workers (`-w`) based on your core count (`(2 x cores) + 1`).

### 4. Persistent Storage & Containerization
When deploying as a Docker container, ensure user connection data is preserved:
* **Directory Permissions:** The standard `Dockerfile` has been pre-configured to grant the non-root `user` ownership over the `/app` workspace directory (`RUN chown user:user /app`). This ensures the default run does not raise a `PermissionError` when writing `connections.json` inside the container.
* **API Error Handling:** If writing to database storage still encounters folder permission errors, the `POST /api/connections` endpoint catches `PermissionError` gracefully and returns an HTTP 403 Forbidden error with a detailed diagnostics message.
* Set the `QUERYDECK_DATA_DIR` environment variable to a folder outside of the application directory (e.g., `/data`).
* Mount a persistent volume to that directory to keep the `connections.json` file across container restarts and updates.
* **Docker Run Command:**
  ```bash
  docker run -d \
    -p 9001:7860 \
    -v /var/lib/querydeck:/data \
    -e QUERYDECK_DATA_DIR=/data \
    --name querydeck \
    your-docker-image
  ```

### 5. Database Connection Hardening
* **Read-Only Credentials:** Ensure all connections registered in QueryDeck use database credentials that are strictly restricted to read-only (`SELECT`) permissions.
* **Network Restrictions (VPCs):** Place QueryDeck in the same Virtual Private Cloud (VPC) as your databases, or set up VPC Peering. Restrict database security groups to only accept incoming traffic on ports `3306` (MySQL) or `8443` (ClickHouse) from the QueryDeck server's security group/IP.

---

## Future Implementation Guide

The following roadmap outlines architectural enhancements planned to mature QueryDeck into an enterprise-ready query suite:

### 1. Built-in Authentication & Multi-Tenancy (RBAC)
* **User Authentication:** Integrate FastAPI Users or OAuth2 directly into the backend using JWT tokens.
* **Role-Based Access Control (RBAC):** Define user roles (e.g., Super Admin, DBA, Data Analyst, Read-Only).
* **Connection Sharing Permissions:** Restrict connection visibilities so that only certain users/teams can see or query specific databases.

### 2. Query Auditing, Compliance & Logging
* **Auditing Database Table:** Create an `audit_logs` schema to log every query executed.
* **Log Fields:** Store user ID, connection ID, query timestamp, execution time (`elapsed_ms`), total rows returned, and the exact SQL code executed.
* **Query Capping/Kill Switch:** Introduce automatic query termination for queries running longer than a configurable threshold (e.g., 60 seconds) to avoid database lockups.

### 3. Saved Queries & Collaborative Dashboards
* **Saved Queries Panel:** Allow users to save their frequently used SQL snippets.
* **Shared Queries:** Let team members publish useful SQL scripts to a shared library.
* **Dynamic Parameterized Queries:** Support query placeholders (e.g., `{{start_date}}` or `{{user_id}}`) so non-technical users can execute queries with simple form inputs.

### 4. Expanded Database Engine Support
Extend the [db.py](file:///C:/Users/CLIRKOL-56/Documents/All_platform_large_data%20_mining/db.py) connection driver interface to support:
* **PostgreSQL / Redshift** (via `psycopg2` or `asyncpg`)
* **Snowflake** (via `snowflake-connector-python`)
* **SQLite** (for local analytics and mock testing)
* **Google BigQuery** (via `google-cloud-bigquery`)

### 5. Advanced Query Editor & Schema Visualizations
* **SQL Formatter:** Add a "Format SQL" button using a library like `sqlparse`.
* **ER Diagrams:** Auto-generate interactive Entity-Relationship diagrams in the sidebar based on foreign key schemas.
* **Visual Query Builder:** Implement a drag-and-drop query constructor for non-technical analysts.

---

## Tech stack

- **Backend**: FastAPI, Uvicorn, PyMySQL, clickhouse-connect, openpyxl, certifi
- **Frontend**: vanilla JS + CodeMirror 5 (SQL mode + hints), Inter & JetBrains Mono
- No build step — the frontend is static files served by the API.


