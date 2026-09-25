import express from "express";
import { MongoClient } from "mongodb";

const app = express();

const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI;

const DB_NAME = "proveedores";
const COLLECTION_NAME = "proveedores";

if (!MONGODB_URI) {
  console.error("No se encontró MONGODB_URI");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);

let collection;

app.use(express.json());

app.use(express.static("public"));


async function conectarMongoDB() {

  await client.connect();

  const db = client.db(DB_NAME);

  collection = db.collection(COLLECTION_NAME);

  console.log("Conectado correctamente a MongoDB Atlas");

}


app.get("/api/proveedores", async (req, res) => {

  try {

    const q = String(req.query.q || "").trim();

    let filtro = {};

    if (q) {

      filtro = {
        $or: [
          { codigo: { $regex: q, $options: "i" } },
          { proveedor: { $regex: q, $options: "i" } },
          { ruc: { $regex: q, $options: "i" } },
          { telefono: { $regex: q, $options: "i" } },
          { correo: { $regex: q, $options: "i" } }
        ]
      };

    }

    const proveedores = await collection
      .find(filtro, { projection: { _id: 0 } })
      .sort({ codigo: 1 })
      .limit(100)
      .toArray();

    res.json(proveedores);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "No se pudieron consultar los proveedores."
    });

  }

});


app.post("/api/proveedores", async (req, res) => {

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
        error: "Código y proveedor son obligatorios."
      });

    }


    const codigoLimpio =
      String(codigo).trim().toUpperCase();


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
        String(correo || "").trim()

    };


    await collection.insertOne(nuevoProveedor);


    res.status(201).json(nuevoProveedor);


  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: "No se pudo guardar el proveedor."
    });

  }

});


conectarMongoDB()

  .then(() => {

    app.listen(PORT, () => {

      console.log(
        `Servidor funcionando en el puerto ${PORT}`
      );

    });

  })

  .catch((error) => {

    console.error(
      "No se pudo conectar a MongoDB:",
      error
    );

    process.exit(1);

  });
