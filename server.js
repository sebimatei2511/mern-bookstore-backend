/**
 * MERN BOOKSTORE E-COMMERCE API v1
 * Server Express.js pentru magazinul online de carti cu functionalitati complete e-commerce
 * Functionalitati implementate:
 * - Catalog de produse (carti) cu preturi si stocuri
 */

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const stripe = require("stripe")(
  "sk_test_51SNrmj7mRgscWxsQlFJbC9AsC0epqrK3OjrtZuQSINAdDfVduiTTpCiapxZm93sZVTyGm0jG43BqsIhqN2thkuCD009yzN2mdg"
);

const USERS_FILE = path.join(__dirname, "data", "users.json");

const { createECDH } = require("crypto");
const { deserialize } = require("v8");
const { DESTRUCTION } = require("dns");
const { title } = require("process");

// Initializarea aplicatiei Express
const app = express();
const PORT = 3000;

// Configurarea middleware-ului de baza
app.use(cors()); // permite cereri cross-origin de la frontend
app.use(express.json()); // parser pentru JSON in request body

// Caile catre fisierele de date
const PRODUCTS_FILE = path.join(__dirname, "data", "books.json");

// Pentru functia helper pentru cart
const CART_FILE = path.join(__dirname, "data", "cart.json");

/**
 * ===========================================
 * FUNCTII HELPER PENTRU GESTIUNEA DATELOR
 * ===========================================
 */

/**
 * Functie helper pentru citirea produselor din fisierul JSON
 * @returns {Array} Array-ul cu produsele sau array gol in caz de eroare
 */

const readProducts = () => {
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, "utf8");
    const parsedData = JSON.parse(data);
    return parsedData.products || [];
  } catch (error) {
    console.error("Eroare la citirea produselor", error);
    return [];
  }
};

/**
 * Functie helper pentru citirea cosului din fisierul JSON
 * @returns {Object} Obiectul cos sau structura default
 */
const readCart = () => {
  try {
    const data = fs.readFileSync(CART_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    // Returneaza cos gol daca fisierul nu exista
    return {
      items: [],
      total: 0,
      totalItems: 0,
      lastUpdated: new Date().toISOString(),
    };
  }
};

/**
 * Functie helper pentru salvarea cosului in fisierul JSON
 * @param {Object} cart - Obiectul cos de salvat
 */
const saveCart = (cart) => {
  try {
    cart.lastUpdated = new Date().toISOString();
    fs.writeFileSync(CART_FILE, JSON.stringify(cart, null, 2));
  } catch (error) {
    console.error("Eroare la salvarea cosului: ", error);
    throw error;
  }
};

/**
 * Funcţie helper pentru citirea utilizatorilor din fişierul JSON
 * @returns {Object} Obiect cu array-ul de utilizatori
 */
const readUsers = () => {
  try {
    const data = fs.readFileSync(USERS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Eroare la citirea utilizatorilor:", error);
    // Returnează structură goală dacă fişierul nu există
    return { users: [] };
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Token required" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "fallback_secret",
    (err, user) => {
      if (err) {
        return res
          .status(403)
          .json({ success: false, message: "Token invalid" });
      }
      req.user = user;
      next();
    }
  );
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res
      .status(403)
      .json({ success: false, message: "Admin access required" });
  }
  next();
};

/**
 * RUTA GET /api/products - Obtine toate produsele active cu optiuni de filtrare
 * Parametri de interogare:
 * - category: filtrare dupa categorie
 */
app.get("/api/products", (req, res) => {
  try {
    let products = readProducts();

    // Filtrare dupa produsele active
    products = products.filter((p) => p.isActive === true);

    // Filtrare dupa categorie
    if (req.query.category) {
      products = products.filter(
        (p) => p.category.toLowerCase() === req.query.category.toLowerCase()
      );
    }

    // === Cautare dupa titlu sau autor ===
    if (req.query.search) {
      const keyword = req.query.search.toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(keyword) ||
          p.author.toLowerCase().includes(keyword)
      );
    }

    // === Sortare ===
    if (req.query.sort) {
      switch (req.query.sort) {
        case "price_asc":
          products.sort((a, b) => a.price - b.price);
          break;
        case "price_desc":
          products.sort((a, b) => b.price - a.price);
          break;
        case "title_asc":
          products.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case "title_desc":
          products.sort((a, b) => b.title.localeCompare(a.title));
          break;
      }
    }

    res.json({
      success: true,
      products,
      total: products.length,
      filters: {
        category: req.query.category || null,
        search: req.query.search || null,
        sort: req.query.sort || null,
      },
    });
  } catch (error) {
    console.error("Eroare la obtinerea produselor", error);
    res.status(500).json({ success: false, message: "Eroare server" });
  }
});

// inainte de app.get('/', (req, res)
/**
* RUTA POST/api/create-checkout-session
Checkout
*/
// creează sesiune Stripe
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const { amount, cartItems } = req.body;
    console.log("creează sesiune checkout pentru suma de:", amount);
    // validāri
    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        error: "Suma invalida",
      });
    }
    // creează randuri pentru produse
    const lineItems = [
      ...cartItems.map((item) => ({
        price_data: {
          currency: "ron",
          product_data: {
            name: item.title,
            description: `de ${item.author}`,
            images: [item.imageUrl],
          },
          unit_amount: Math.round(item.price * 100), // preț per unitate
          // deoarce Stripe lucrează în subunități: RON BANI (1 RON=100 bani)
        },
        quantity: item.quantity,
      })),
      // adaugăm transportul
      {
        price_data: {
          currency: "ron",
          product_data: {
            name: "Transport",
            description: "Cost livrare",
          },
          unit_amount: 1999, // 19.99 RON
        },
        quantity: 1,
      },
    ];
    // creează sesiunea Stripe Checkout
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${req.headers.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}&clear_cart=true`,
      cancel_url: `${req.headers.origin}/`,
      metadata: {
        order_type: "book_store",
      },
    });
    console.log("Sesiune checkout creata:", session.id);
    res.json({
      success: true,
      sessionId: session.id,
      sessionUrl: session.url,
    });
  } catch (error) {
    console.error("Eroare Stripe:", error);
    res.status(500).json({
      success: false,
      error: "Eroare la crearea sesiunii de plată",
    });
  }
});

app.get("/api/check-payment-status/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.json({
      success: true,
      paymentStatus: session.payment_status,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: "Eroare verificare plată" });
  }
});

/**
 * RUTA POST /api/clear-cart Golește coşul
 */
app.post("/api/clear-cart", async (req, res) => {
  try {
    const cart = await readCart();
    // sterge toate produsele din coş
    cart.items = [];
    cart.total = 0;
    cart.totalItems = 0;
    saveCart(cart);
    res.json({
      success: true,
      message: "Coş golit cu succes",
    });
  } catch (error) {
    console.error("Eroare la golirea coşului:", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la golirea coșului",
    });
  }
});

/**
 * RUTA GET / - Informatii despre API
 */
app.get("/", (req, res) => {
  res.json({
    message: "MERN BookStore API v1",
    description: "API simplu pentru catalogul de carti",
    version: "1.0.0",
    endpoints: {
      "GET /api/products": "Ontine toate produsele active",
      "GET /api/products?category=React": "Filtrare dupa categorie",
    },
    author: "SIA",
  });
});

/**
 * RUTA POST /api/cart - Adauga un produs in cos
 * Bosy> { productID, quantity }
 */
app.post("/api/cart", (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "ID produs este obligatoriu",
      });
    }

    // Citeste produsele pentru a verifica existenta
    const products = readProducts();
    const product = products.find(
      (p) => p.id === productId && p.isActive === true
    );

    if (!product) {
      return res.status(400).json({
        success: false,
        message: "Produsul nu a fost gasit",
      });
    }

    if (product.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: "Stoc insuficient",
      });
    }

    // Citeste cosul existent sau creeaza unul nou
    const cart = readCart();

    // Verifica daca produsul exista deja in cos
    const existingItemIndex = cart.items.findIndex(
      (item) => item.productId === productId
    );

    if (existingItemIndex > -1) {
      // Actualizeaza cantitatea
      cart.items[existingItemIndex].quantity += quantity;
    } else {
      // Adauga produs nou in cos
      cart.items.push({
        productId,
        quantity,
        title: product.title,
        author: product.author,
        price: product.discountPrice || product.price,
        imageUrl: product.imageUrl,
        addedAt: new Date().toISOString(),
      });
    }

    // Recalculeaza totalul
    cart.total = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    // Salveaza cosul actualizat
    saveCart(cart);

    res.json({
      success: true,
      message: "Produs adaugat in cos",
      cart: cart,
    });
  } catch (error) {
    console.error("Eroare la adaugarea in cos: ", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la adaugarea in cos",
    });
  }
});

/**
 * RUTA GET /api/cart - Obtine continutul cosului
 */
app.get("/api/cart", (req, res) => {
  try {
    const cart = readCart();
    res.json({
      success: true,
      cart: cart,
    });
  } catch (error) {
    console.error("Eroare la obtinerea cosului: ", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la obtinerea cosului",
    });
  }
});

/**
 * RUTA DELETE /api/cart/:productId - Sterge un produs din cos
 */
app.delete("/api/cart/:productId", (req, res) => {
  try {
    const { productId } = req.params;
    const cart = readCart();

    console.log("DEBUG - productId primit:", productId);
    console.log("DEBUG - Cart inainte:", JSON.stringify(cart.items, null, 2));

    // Convertim productId la number
    const productIdNum = Number(productId);

    // Filtreaza cartile din cos, eliminand pe cel cu productId-ul dorit
    cart.items = cart.items.filter((item) => item.productId !== productIdNum);

    // Recalculeaza totalul
    cart.total = cart.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    cart.totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);

    saveCart(cart);

    res.json({
      success: true,
      message: "Produs sters din cos",
      cart: cart,
    });
  } catch (error) {
    console.error("Eroare la stergerea dn cos: ", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la stergerea din cos",
    });
  }
});

/**
 * RUTA POST /api/admin/login Login pentru admin
 */
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Încercare login admin:", email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email și parolă sunt obligatorii",
      });
    }

    const usersData = readUsers();
    const user = usersData.users.find(
      (u) => u.email === email && u.role === "admin"
    );

    if (!user) {
      console.log("Utilizator admin negăsit:", email);
      return res.status(401).json({
        success: false,
        message: "Acces restricționat doar administratori",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      console.log("Parolă incorectă pentru:", email);
      return res.status(401).json({
        success: false,
        message: "Parolă incorectă",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "8h" }
    );

    console.log("Login admin reuşit:", email);
    res.json({
      success: true,
      message: "Autentificare admin reușită",
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Eroare la login admin:", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la autentificare",
    });
  }
});

/**
 * RUTA POST /api/admin/products Adaugă produs nou cu TOATE câmpurile
 */
app.post("/api/admin/products", authenticateToken, requireAdmin, (req, res) => {
  try {
    const {
      title,
      author,
      price,
      description,
      imageUrl,
      category,
      stock,
      discountPrice,
      isbn,
      publisher,
      pages,
      year,
      rating,
      reviewCount,
      tags,
      featured,
    } = req.body;

    console.log("Date primite pentru produs nou:", req.body);

    // VALIDARI OBLIGATORII
    const requiredFields = ["title", "author", "price", "stock"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Câmpuri obligatorii lipsă: ${missingFields.join(", ")}`,
        missingFields,
      });
    }

    // VALIDARI SUPLIMENTARE
    if (price < 0) {
      return res.status(400).json({
        success: false,
        message: "Prețul nu poate fi negativ",
      });
    }
    if (stock < 0) {
      return res.status(400).json({
        success: false,
        message: "Stocul nu poate fi negativ",
      });
    }
    if (discountPrice && discountPrice > price) {
      return res.status(400).json({
        success: false,
        message: "Prețul redus nu poate fi mai mare decât prețul original",
      });
    }

    const products = readProducts(); // (Asigură-te că ai o funcție readProducts similară cu readUsers)

    // GENERARE ID INCREMENTAT
    const lastProduct = products[products.length - 1];
    const newId = lastProduct ? lastProduct.id + 1 : 1;

    // CREEAZĂ PRODUS NOU CU TOATE CÂMPURILE
    const newProduct = {
      id: newId,
      title: title.trim(),
      author: author.trim(),
      isbn: isbn?.trim() || "",
      category: category?.trim() || "General",
      price: parseFloat(price),
      discountPrice: discountPrice ? parseFloat(discountPrice) : null,
      description: description?.trim() || "",
      imageUrl: imageUrl?.trim() || "/images/default-book.jpg",
      stock: parseInt(stock),
      isActive: true,
      featured: featured || false,
      rating: rating ? parseFloat(rating) : null,
      reviewCount: reviewCount ? parseInt(reviewCount) : 0,
      tags: tags || [],
      specifications: {
        pages: pages?.toString() || "",
        language: "Romanian",
        publisher: publisher?.trim() || "",
        year: year?.toString() || "",
        format: "Paperback",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: req.user.id,
    };

    // ADAUGĂ PRODUSUL
    products.push(newProduct);

    // SALVEAZĂ ÎN FIŞIER
    const productsData = { products };
    // (Asigură-te că ai definit PRODUCTS_FILE și ai 'fs' importat)
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(productsData, null, 2));

    console.log("Produs adăugat cu succes:", newProduct.id);
    res.status(201).json({
      success: true,
      message: "Produs adăugat cu succes",
      product: newProduct,
    });
  } catch (error) {
    console.error("Eroare la adăugarea produsului:", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la adăugarea produsului",
      error: error.message,
    });
  }
});

/**
 * RUTA GET /api/admin/products Obține toate produsele pentru admin (cu filtre)
 * Parametri interogare:
 * - category: filtrare după categorie
 * - search: căutare în titlu/autor
 * - status: active/inactive (all pentru toate)
 * - page: paginare
 * - limit: număr produse per pagină
 */
app.get("/api/admin/products", authenticateToken, requireAdmin, (req, res) => {
  try {
    const {
      category,
      search,
      status = "all",
      page = 1,
      limit = 50, // Poti seta o valoare mai mică, ex: 10, pentru testare
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    console.log("Filtre administrare produse:", {
      category,
      search,
      status,
      page,
      limit,
    });

    let products = readProducts();

    // FILTRARE DUPĂ STATUS [cite: 310-316]
    if (status === "active") {
      products = products.filter((p) => p.isActive === true);
    } else if (status === "inactive") {
      products = products.filter((p) => p.isActive === false);
    }
    // 'all' afişează toate produsele [cite: 317]

    // FILTRARE DUPĂ CATEGORIE [cite: 319-323]
    if (category && category !== "all") {
      products = products.filter((p) =>
        p.category.toLowerCase().includes(category.toLowerCase())
      );
    }

    // CAUTARE ÎN TITLU ȘI AUTOR [cite: 325-332]
    if (search) {
      const searchTerm = search.toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(searchTerm) ||
          p.author.toLowerCase().includes(searchTerm) ||
          (p.isbn && p.isbn.includes(search))
      );
    }

    // SORTARE [cite: 333-350]
    const sortField = sortBy || "createdAt";
    const order = sortOrder === "asc" ? 1 : -1;

    products.sort((a, b) => {
      if (
        sortField === "title" ||
        sortField === "author" ||
        sortField === "category"
      ) {
        return order * a[sortField].localeCompare(b[sortField]);
      } else if (
        sortField === "price" ||
        sortField === "stock" ||
        sortField === "rating"
      ) {
        return order * (a[sortField] - b[sortField]);
      } else {
        // createdAt sau alte câmpuri de data
        return order * (new Date(a[sortField]) - new Date(b[sortField]));
      }
    });

    // PAGINARE [cite: 351-357]
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedProducts = products.slice(startIndex, endIndex);

    // STATISTICI [cite: 358-363]
    const totalProducts = products.length;
    const activeProducts = products.filter((p) => p.isActive).length;
    const inactiveProducts = products.filter((p) => !p.isActive).length;
    const lowStockProducts = products.filter(
      (p) => p.stock < 10 && p.stock > 0
    ).length;
    const outOfStockProducts = products.filter((p) => p.stock === 0).length;

    res.json({
      success: true,
      products: paginatedProducts,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalProducts / limitNum),
        totalProducts,
        productsPerPage: limitNum,
        hasNextPage: endIndex < totalProducts,
        hasPrevPage: startIndex > 0,
      },
      statistics: {
        total: totalProducts,
        active: activeProducts,
        inactive: inactiveProducts,
        lowStock: lowStockProducts,
        outOfStock: outOfStockProducts,
      },
      filters: {
        category: category || "all",
        search: search || "",
        status: status,
        sortBy: sortField,
        sortOrder: sortOrder,
      },
    });
  } catch (error) {
    console.error("Eroare la obținerea produselor admin:", error);
    res.status(500).json({
      success: false,
      message: "Eroare server la obținerea produselor",
    });
  }
});

/**
 * RUTA PUT /api/admin/products/:id Actualizează produs
 */
app.put(
  "/api/admin/products/:id",
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const updates = req.body; // Datele de actualizat
      let products = readProducts();

      const productIndex = products.findIndex((p) => p.id === productId);

      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Produsul nu a fost găsit",
        });
      }

      // Actualizează produsul păstrând câmpurile vechi și suprascriind cele noi
      products[productIndex] = {
        ...products[productIndex], // Păstrează datele vechi
        ...updates, // Aplică actualizările
        updatedAt: new Date().toISOString(), // Setează data actualizării
      };

      // Salvează în fișier
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2));

      res.json({
        success: true,
        message: "Produs actualizat cu succes",
        product: products[productIndex],
      });
    } catch (error) {
      console.error("Eroare la actualizarea produsului:", error);
      res.status(500).json({
        success: false,
        message: "Eroare server la actualizarea produsului",
      });
    }
  }
);

/**
 * RUTA DELETE /api/admin/products/:id Șterge sau dezactivează produs
 */
app.delete('/api/admin/products/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    // Verifică dacă se dorește ștergere permanentă (ex: ?permanent=true)
    const { permanent = false } = req.query; 
    let products = readProducts();
    const productIndex = products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Produsul nu a fost găsit'
      });
    }

    let message = '';
    if (permanent) {
      // Ștergere permanentă
      products.splice(productIndex, 1);
      message = 'Produs șters definitiv';
    } else {
      // Soft delete (doar dezactivează)
      products[productIndex].isActive = false;
      products[productIndex].updatedAt = new Date().toISOString();
      message = 'Produs dezactivat cu succes';
    }

    // Salvează modificările în fișier
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2));

    res.json({
      success: true,
      message
    });

  } catch (error) {
    console.error('Eroare la ștergerea produsului:', error);
    res.status(500).json({
      success: false,
      message: 'Eroare server la ștergerea produsului'
    });
  }
});

/**
 * RUTA GET /api/admin/products/:id Obține un singur produs
 */
app.get('/api/admin/products/:id', authenticateToken, requireAdmin, (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    const products = readProducts();
    const product = products.find(p => p.id === productId);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Produsul nu a fost găsit'
      });
    }

    res.json({
      success: true,
      product
    });

  } catch (error) {
    console.error('Eroare la obținerea produsului:', error);
    res.status(500).json({
      success: false,
      message: 'Eroare server la obținerea produsului'
    });
  }
});

// Pornirea serverului
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`\n MERN BookStore API v1`);
    console.log(` Serverul ruleaza pe: http://localhost:${PORT}`);
    console.log(` Produse: http://localhost:${PORT}/api/products`);
    console.log(`\n Server pregatit pentru utilizare!`);
  });
}

// Exporta aplicatia pentru testare
module.exports = app;

// testare API endpoint
// curl "http://localhost:3000/api/products" | head -20
// testare filtrare dupa categorie
// curl "http://localhost:3000/api/products?category=React" | jq '.total'
// testare root endpoint
// curl "http://localhost:3000/" | jq
// testarea poate fi realizata si din browser, Thunder Client, Postman
