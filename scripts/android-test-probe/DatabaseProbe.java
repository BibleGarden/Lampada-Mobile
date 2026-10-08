package garden.lampada.testprobe;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.os.Build;
import android.os.Bundle;
import java.io.File;
import java.net.URI;
import org.json.JSONArray;
import org.json.JSONObject;

// Подписанный тем же тестовым ключом probe получает доступ к БД Release
// без root и без изменения приложения. На физическом устройстве и для
// production-сборки он явно отказывается выполнять любые операции.
public final class DatabaseProbe extends Instrumentation {
    private Bundle arguments;

    @Override public void onCreate(Bundle values) {
        super.onCreate(values);
        arguments = values;
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            if (!"ranchu".equals(Build.HARDWARE) && !"goldfish".equals(Build.HARDWARE)) {
                throw new IllegalStateException("Database probe requires an Android emulator");
            }
            Context context = getTargetContext();
            ApplicationInfo info = context.getPackageManager().getApplicationInfo(
                context.getPackageName(), PackageManager.GET_META_DATA);
            if (info.metaData == null || !"test".equals(info.metaData.getString("garden.lampada.BUILD_CHANNEL"))) {
                throw new IllegalStateException("Database probe requires an explicit test build");
            }
            String origin = info.metaData.getString("garden.lampada.API_ORIGIN");
            if (origin == null || "api.bible.garden".equals(new URI(origin).getHost())) {
                throw new IllegalStateException("Database probe must not target the production API");
            }
            File file = new File(context.getFilesDir(), "SQLite/lampada.db");
            if (!file.isFile()) throw new IllegalStateException("Lampada database does not exist");
            String mode = arguments.getString("mode");
            String sql = arguments.getString("sql");
            if (sql == null || sql.isEmpty()) throw new IllegalArgumentException("SQL is required");
            JSONArray rows = new JSONArray();
            try (SQLiteDatabase database = SQLiteDatabase.openDatabase(file.getPath(), null,
                    "query".equals(mode) ? SQLiteDatabase.OPEN_READONLY : SQLiteDatabase.OPEN_READWRITE)) {
                if ("query".equals(mode)) {
                    try (Cursor cursor = database.rawQuery(sql, null)) {
                        while (cursor.moveToNext()) {
                            JSONObject row = new JSONObject();
                            for (int i = 0; i < cursor.getColumnCount(); i++) {
                                Object value;
                                switch (cursor.getType(i)) {
                                    case Cursor.FIELD_TYPE_NULL: value = JSONObject.NULL; break;
                                    case Cursor.FIELD_TYPE_INTEGER: value = cursor.getLong(i); break;
                                    case Cursor.FIELD_TYPE_FLOAT: value = cursor.getDouble(i); break;
                                    case Cursor.FIELD_TYPE_STRING: value = cursor.getString(i); break;
                                    default: throw new IllegalArgumentException("BLOB queries are not supported");
                                }
                                row.put(cursor.getColumnName(i), value);
                            }
                            rows.put(row);
                        }
                    }
                } else if ("execute".equals(mode)) {
                    database.execSQL(sql);
                } else {
                    throw new IllegalArgumentException("Expected query or execute mode");
                }
            }
            result.putString("report", new JSONObject().put("ok", true).put("rows", rows).toString());
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("error", error.toString());
            finish(Activity.RESULT_CANCELED, result);
        }
    }
}
