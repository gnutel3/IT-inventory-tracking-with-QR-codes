"""Frozen schema of stage 6. Do not change when application models evolve."""
import sqlalchemy as sa

metadata = sa.MetaData()


def integer(name, nullable=False, primary_key=False):
    return sa.Column(name, sa.Integer, nullable=nullable, primary_key=primary_key)


def string(name, length, nullable=False, **kwargs):
    return sa.Column(name, sa.String(length), nullable=nullable, **kwargs)


def reference(name, target, primary_key=False, index=False):
    return sa.Column(name, sa.Integer, sa.ForeignKey(target), nullable=False, primary_key=primary_key, index=index)


sa.Table("categories", metadata, integer("id", primary_key=True), string("name", 100, unique=True))
sa.Table("locations", metadata, integer("id", primary_key=True), string("name", 100, unique=True))
sa.Table("devices", metadata,
         integer("id", primary_key=True), string("inventory_number", 64, unique=True, index=True),
         string("name", 200), string("manufacturer", 100, True), string("model", 100, True),
         string("serial_number", 120, True), sa.Column("purchase_date", sa.Date),
         sa.Column("purchase_price", sa.Numeric(12, 2)), string("status", 30),
         sa.Column("description", sa.Text), sa.Column("category_id", sa.Integer, sa.ForeignKey("categories.id")),
         sa.Column("location_id", sa.Integer, sa.ForeignKey("locations.id")),
         sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
         sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
sa.Table("device_profiles", metadata, reference("device_id", "devices.id", primary_key=True),
         string("owner", 120, True), integer("useful_life_months"))
sa.Table("device_qr_tags", metadata, reference("device_id", "devices.id", primary_key=True),
         string("token", 32, unique=True))
sa.Table("depreciation_settings", metadata, integer("id", primary_key=True), string("term_mode", 10),
         integer("fixed_months"), integer("residual_floor_percent"), integer("writeoff_threshold_percent"))
sa.Table("users", metadata, integer("id", primary_key=True), string("username", 64, unique=True),
         string("password_hash", 255), string("role", 16), sa.Column("active", sa.Boolean, nullable=False))
sa.Table("login_sessions", metadata, string("token_hash", 64, primary_key=True),
         reference("user_id", "users.id", index=True), string("csrf_token", 64), integer("expires_at"))
sa.Table("login_throttle", metadata, string("key", 64, primary_key=True), integer("attempts"), integer("reset_at"))
sa.Table("device_movements", metadata, integer("id", primary_key=True),
         reference("device_id", "devices.id", index=True), string("from_location", 100, True),
         string("to_location", 100, True), sa.Column("moved_at", sa.DateTime, nullable=False))
sa.Table("device_repairs", metadata, integer("id", primary_key=True),
         reference("device_id", "devices.id", index=True), string("issue", 500), string("contractor", 120),
         sa.Column("cost", sa.Numeric(12, 2), nullable=False),
         sa.Column("started_at", sa.DateTime, nullable=False), sa.Column("finished_at", sa.DateTime))
sa.Table("inventory_checks", metadata, integer("id", primary_key=True), string("location", 100),
         sa.Column("created_at", sa.DateTime, nullable=False), integer("expected"), integer("found"),
         sa.Column("rows", sa.JSON, nullable=False))


def validate_existing(connection):
    inspector = sa.inspect(connection)
    tables = set(inspector.get_table_names()) - {"alembic_version"}
    if tables != set(metadata.tables):
        raise RuntimeError("Структура базы не совпадает с этапом 6: проверьте набор таблиц. База не обновлена.")
    for name, expected in metadata.tables.items():
        columns = {column["name"]: column for column in inspector.get_columns(name)}
        if set(columns) != set(expected.columns.keys()):
            raise RuntimeError(f"Не совпадают столбцы таблицы {name}. Автопереход остановлен.")
        for column in expected.columns:
            actual = columns[column.name]
            # Compare dialect-independent type families and sizes.
            actual_type, expected_type = actual["type"], column.type
            if (actual_type._type_affinity != expected_type._type_affinity or
                    actual["nullable"] != column.nullable or
                    any(getattr(actual_type, attr, None) != getattr(expected_type, attr, None)
                        for attr in ("length", "precision", "scale"))):
                raise RuntimeError(f"Не совпадает тип/ограничение {name}.{column.name}. Переход остановлен.")
        if inspector.get_pk_constraint(name)["constrained_columns"] != [column.name for column in expected.primary_key]:
            raise RuntimeError(f"Не совпадает первичный ключ {name}.")
        unique = {tuple(item["column_names"]) for item in inspector.get_unique_constraints(name)}
        indexes = inspector.get_indexes(name)
        unique.update(tuple(item["column_names"]) for item in indexes if item["unique"])
        required = {tuple(column.name for column in item.columns) for item in expected.constraints
                    if isinstance(item, sa.UniqueConstraint)}
        required.update(tuple(column.name for column in item.columns) for item in expected.indexes if item.unique)
        if not required.issubset(unique):
            raise RuntimeError(f"Не совпадают уникальные ограничения {name}.")
        foreign = {(tuple(item["constrained_columns"]), item["referred_table"], tuple(item["referred_columns"]))
                   for item in inspector.get_foreign_keys(name)}
        required_foreign = {(tuple(element.parent.name for element in item.elements),
                             item.referred_table.name, tuple(element.column.name for element in item.elements))
                            for item in expected.foreign_key_constraints}
        if foreign != required_foreign:
            raise RuntimeError(f"Не совпадают внешние ключи {name}.")
