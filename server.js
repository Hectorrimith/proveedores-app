import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import multer from "multer";
import XLSX from "xlsx";
import session from "express-session";

const app = express();

const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

const DB_NAME = "proveedores";
const COLLECTION_NAME = "proveedores";

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!MONGODB_URI) {
  console.error("No se encontró MONGODB_URI");
  process.exit(1);
}

if (!ADMIN_PASSWORD) {
  console.error("No se encontró ADMIN_PASSWORD en Render");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);

let collection;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "cambia-este-secret-en-render",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: true,
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

function requireLogin(req, res, next) {
  if (req.session.loggedIn) {
    return next();
  }

  return res.status(401).json({
    error: "No autorizado. Inicia sesión."
  });
}

app.use(express.static("public"));

// ===============================
// LOGIN
// ===============================

app.get("/api/auth/status", (req, res) => {
  res.json({
    loggedIn: !!req.session.loggedIn
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === ADMIN_USER &&
    password === ADMIN_PASSWORD
  ) {
    req.session.loggedIn = true;

    return res.json({
      ok: true
    });
  }

  res.status(401).json({
    error: "Usuario o contraseña incorrectos."
  });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

// ===============================
// CONSULTAR PROVEEDORES
// ===============================

app.get(
  "/api/proveedores",
  requireLogin,
  async (req, res) => {
    try {
      const q = String(
        req.query.q || ""
      ).trim();

      let filtro = {};

      if (q) {
        const safe = q.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );

        filtro = {
          $or: [
            {
              codigo: {
                $regex: safe,
                $options: "i"
              }
            },
            {
              proveedor: {
                $regex: safe,
                $options: "i"
              }
            },
            {
              ruc: {
                $regex: safe,
                $options: "i"
              }
            },
            {
              telefono: {
                $regex: safe,
                $options: "i"
              }
            },
            {
              correo: {
                $regex: safe,
                $options: "i"
              }
            }
          ]
        };
      }

      const proveedores =
        await collection
          .find(filtro, {
            projection: {
              _id: 1,
              codigo: 1,
              proveedor: 1,
              ruc: 1,
              telefono: 1,
              correo: 1
            }
          })
          .sort({
            codigo: 1
          })
          .limit(1000)
          .toArray();

      res.json(proveedores);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No se pudieron consultar los proveedores."
      });
    }
  }
);

// ===============================
// AGREGAR PROVEEDOR
// ===============================

app.post(
  "/api/proveedores",
  requireLogin,
  async (req, res) => {
    try {
      const {
        codigo,
        proveedor,
        ruc,
        telefono,
        correo
      } = req.body;

      if (!codigo || !proveedor) {
        return res.status(400).json({
          error:
            "Código y proveedor son obligatorios."
        });
      }

      const codigoLimpio =
        String(codigo)
          .trim()
          .toUpperCase();

      const existente =
        await collection.findOne({
          codigo: codigoLimpio
        });

      if (existente) {
        return res.status(409).json({
          error:
            `Ya existe un proveedor con el código ${codigoLimpio}.`
        });
      }

      const nuevoProveedor = {
        codigo: codigoLimpio,
        proveedor:
          String(proveedor).trim(),
        ruc:
          String(ruc || "").trim(),
        telefono:
          String(telefono || "").trim(),
        correo:
          String(correo || "").trim(),
        actualizadoEn: new Date()
      };

      await collection.insertOne(
        nuevoProveedor
      );

      res.status(201).json(
        nuevoProveedor
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No se pudo guardar el proveedor."
      });
    }
  }
);

// ===============================
// EDITAR PROVEEDOR
// ===============================

app.put(
  "/api/proveedores/:id",
  requireLogin,
  async (req, res) => {
    try {
      if (
        !ObjectId.isValid(req.params.id)
      ) {
        return res.status(400).json({
          error: "ID inválido."
        });
      }

      const {
        codigo,
        proveedor,
        ruc,
        telefono,
        correo
      } = req.body;

      if (!codigo || !proveedor) {
        return res.status(400).json({
          error:
            "Código y proveedor son obligatorios."
        });
      }

      const id = new ObjectId(
        req.params.id
      );

      const codigoLimpio =
        String(codigo)
          .trim()
          .toUpperCase();

      const duplicado =
        await collection.findOne({
          codigo: codigoLimpio,
          _id: {
            $ne: id
          }
        });

      if (duplicado) {
        return res.status(409).json({
          error:
            `Ya existe otro proveedor con el código ${codigoLimpio}.`
        });
      }

      const cambios = {
        codigo: codigoLimpio,
        proveedor:
          String(proveedor).trim(),
        ruc:
          String(ruc || "").trim(),
        telefono:
          String(telefono || "").trim(),
        correo:
          String(correo || "").trim(),
        actualizadoEn: new Date()
      };

      await collection.updateOne(
        {
          _id: id
        },
        {
          $set: cambios
        }
      );

      res.json({
        _id: id,
        ...cambios
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No se pudo actualizar el proveedor."
      });
    }
  }
);

// ===============================
// ELIMINAR PROVEEDOR
// ===============================

app.delete(
  "/api/proveedores/:id",
  requireLogin,
  async (req, res) => {
    try {
      if (
        !ObjectId.isValid(req.params.id)
      ) {
        return res.status(400).json({
          error: "ID inválido."
        });
      }

      const result =
        await collection.deleteOne({
          _id: new ObjectId(
            req.params.id
          )
        });

      if (!result.deletedCount) {
        return res.status(404).json({
          error:
            "Proveedor no encontrado."
        });
      }

      res.json({
        ok: true
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No se pudo eliminar el proveedor."
      });
    }
  }
);

// ===============================
// IMPORTAR EXCEL
// ===============================

const upload = multer({
  storage:
    multer.memoryStorage(),

  limits: {
    fileSize:
      10 * 1024 * 1024
  }
});

app.post(
  "/api/importar-excel",
  requireLogin,
  upload.single("archivo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            "Selecciona un archivo Excel."
        });
      }

      const workbook =
        XLSX.read(
          req.file.buffer,
          {
            type: "buffer"
          }
        );

      const firstSheet =
        workbook.Sheets[
          workbook.SheetNames[0]
        ];

      const rows =
        XLSX.utils.sheet_to_json(
          firstSheet,
          {
            defval: ""
          }
        );

      let creados = 0;
      let actualizados = 0;
      let errores = 0;

      const detalles = [];

      for (const row of rows) {

        const codigo =
          String(
            row.codigo ??
            row.Codigo ??
            row.CÓDIGO ??
            ""
          )
            .trim()
            .toUpperCase();

        const proveedor =
          String(
            row.proveedor ??
            row.Proveedor ??
            ""
          ).trim();

        const ruc =
          String(
            row.ruc ??
            row.RUC ??
            ""
          ).trim();

        const telefono =
          String(
            row.telefono ??
            row.Telefono ??
            ""
          ).trim();

        const correo =
          String(
            row.correo ??
            row.Correo ??
            ""
          ).trim();

        if (!codigo || !proveedor) {
          errores++;

          detalles.push(
            "Fila sin código o proveedor."
          );

          continue;
        }

        const documento = {
          codigo,
          proveedor,
          ruc,
          telefono,
          correo,
          actualizadoEn:
            new Date()
        };

        const result =
          await collection.updateOne(
            {
              codigo
            },
            {
              $set: documento
            },
            {
              upsert: true
            }
          );

        if (
          result.upsertedCount
        ) {
          creados++;
        } else if (
          result.modifiedCount
        ) {
          actualizados++;
        }
      }

      res.json({
        ok: true,
        creados,
        actualizados,
        errores,
        detalles:
          detalles.slice(0, 10)
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No se pudo importar el Excel. Verifica que sea .xlsx o .xls."
      });
    }
  }
);

// ===============================
// EXPORTAR EXCEL
// ===============================

app.get(
  "/api/exportar-excel",
  requireLogin,
  async (req, res) => {
    try {

      const proveedores =
        await collection
          .find(
            {},
            {
              projection: {
                _id: 0,
                codigo: 1,
                proveedor: 1,
                ruc: 1,
                telefono: 1,
                correo: 1
              }
            }
          )
          .sort({
            codigo: 1
          })
          .toArray();

      const data =
        proveedores.map(
          (p) => ({
            codigo:
              p.codigo || "",
            proveedor:
              p.proveedor || "",
            ruc:
              p.ruc || "",
            telefono:
              p.telefono || "",
            correo:
              p.correo || ""
          })
        );

      const ws =
        XLSX.utils.json_to_sheet(
          data
        );

      const wb =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        wb,
        ws,
        "Proveedores"
      );

      const buffer =
        XLSX.write(
          wb,
          {
            type: "buffer",
            bookType: "xlsx"
          }
        );

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );

      res.setHeader(
        "Content-Disposition",
        'attachment; filename="proveedores.xlsx"'
      );

      res.send(buffer);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "No se pudo exportar el Excel."
      });
    }
  }
);

// ===============================
// PLANTILLA EXCEL
// ===============================

app.get(
  "/api/plantilla-excel",
  requireLogin,
  (req, res) => {

    const data = [
      {
        codigo: "P009",
        proveedor:
          "Ejemplo S.A.",
        ruc:
          "155-000-000",
        telefono:
          "6000-0000",
        correo:
          "ejemplo@correo.com"
      }
    ];

    const ws =
      XLSX.utils.json_to_sheet(
        data
      );

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      "Proveedores"
    );

    const buffer =
      XLSX.write(
        wb,
        {
          type: "buffer",
          bookType: "xlsx"
        }
      );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="plantilla_proveedores.xlsx"'
    );

    res.send(buffer);
  }
);

// ===============================
// CONEXIÓN A MONGODB
// ===============================

async function conectarMongoDB() {

  await client.connect();

  const db =
    client.db(DB_NAME);

  collection =
    db.collection(
      COLLECTION_NAME
    );

  await collection.createIndex(
    {
      codigo: 1
    },
    {
      unique: true
    }
  );

  console.log(
    "Conectado correctamente a MongoDB Atlas"
  );
}

conectarMongoDB()
  .then(() => {

    app.listen(
      PORT,
      () => {
        console.log(
          `Servidor funcionando en el puerto ${PORT}`
        );
      }
    );

  })
  .catch(
    (error) => {

      console.error(
        "No se pudo conectar a MongoDB:",
        error
      );

      process.exit(1);
    }
  );
