import db

def test_preset_connections():
    conns = db.all_connections()
    print("Preset connections:")
    for c in conns:
        print(f"ID: {c['id']}, Name: {c['name']}, Engine: {c['engine']}, Provider: {c.get('provider')}")
        # Let's test the connection
        res = db.test_connection(c)
        print(f"  Test: {res}")
        if res.get('ok'):
            try:
                schema = db.get_schema(c)
                print(f"  Schema: loaded {len(schema.get('tables', []))} tables")
                if schema.get('tables'):
                    table_name = schema['tables'][0]['name']
                    print(f"  Querying first table: {table_name}")
                    query_res = db.run_query(c, f"SELECT * FROM `{table_name}` LIMIT 5")
                    print(f"    Columns: {query_res.get('columns')}")
                    print(f"    Rows count: {len(query_res.get('rows', []))}")
            except Exception as e:
                print(f"  Error loading schema/running query: {e}")
        print("-" * 50)

if __name__ == "__main__":
    test_preset_connections()
