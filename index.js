const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const admin = require("firebase-admin");
dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_SECRET);

app.use(cors({ origin: ['http://localhost:5173','https://clever-sprite-0120ae.netlify.app'], credentials: true }));
app.use(express.json());










// Middleware

const serviceAccount = require("./edufirebaseidtoken.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rhmlrci.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("edu-managedb");
    const classCollection = db.collection("classes");
    const userCollection = db.collection("users");
    const teacherRequestCollection = db.collection("teacherRequests");
    const enrollmentCollection = db.collection("enrollments");
   const feedbackCollection = db.collection("feedbacks");
   const assignmentCollection = db.collection("assignments");
   const assignmentSubmissionsCollection = db.collection("assignmentSubmissions");




 // Middleware to verify Firebase token
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;

      console.log("Auth Header:", authHeader);
      if (!authHeader) return res.status(401).send({ message: 'Unauthorized' });
      const token = authHeader.split(' ')[1];
      if (!token) return res.status(401).send({ message: 'Unauthorized' });
      try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.decodedToken = decodedToken;
        next();
      } catch (error) {
        return res.status(403).send({ message: 'Forbidden access' });
      }
    };


// Admin token verification middleware


const verifyAdmin = async (req, res, next) => {
  const email = req.decodedToken.email;
  const query = { email: email };
  const user = await userCollection.findOne(query);

if (!user || user.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden access' });
  }

  next();

}


// assignment submission API

app.post('/assignments/submit', async (req, res) => {
  try {
    const submission = req.body;

    // Map 'submissionFile' from client to 'submissionURL' for DB
    if (submission.submissionFile) {
      submission.submissionURL = submission.submissionFile;
      delete submission.submissionFile;
    }

    // Validation: check for required fields
    if (!submission.assignmentId || !submission.studentEmail || !submission.submissionURL) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    submission.submittedAt = new Date();

    const result = await assignmentSubmissionsCollection.insertOne(submission);
    res.status(201).json({ message: "Assignment submitted successfully", insertedId: result.insertedId });

  } catch (error) {
    console.error("Submission Error:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


// feedback api


app.post('/feedbacks', async (req, res) => {
  try {
    const feedback = req.body;  
    

 
    feedback.createdAt = new Date();

    const result = await feedbackCollection.insertOne(feedback);
    if (result.insertedId) {
      res.status(201).send({ message: 'Feedback successful', insertedId: result.insertedId });
    } else {
      res.status(500).send({ message: 'Feedback could not be added' });
    }
  } catch (error) {
 
    res.status(500).send({ message: 'ServerError' });
  }
});






app.get('/feedbacks', async (req, res) => {
  try {
    const feedbacks = await feedbackCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(feedbacks);
  } catch (error) {
    console.error('Error fetching feedbacks:', error);
    res.status(500).send({ error: 'Failed to fetch feedbacks' });
  }
});




    // tolal enrollments  api
    app.post("/enrollments", async (req, res) => {
  try {
    const enrollmentData = req.body;

    // Check if already enrolled
    const alreadyEnrolled = await enrollmentCollection.findOne({
      studentEmail: enrollmentData.studentEmail,
      classId: enrollmentData.classId
    });

    if (alreadyEnrolled) {
      return res.status(400).send({ message: "Already enrolled in this class." });
    }

    // Insert new enrollment
    const result = await enrollmentCollection.insertOne(enrollmentData);
    res.send(result);
  } catch (error) {
    console.error("Enrollment Save Error:", error);
    res.status(500).send({ message: "Failed to save enrollment." });
  }
});





app.get('/my-enrollments', verifyFBToken, async (req, res) => {
  const studentEmail = req.user.email;
  try {
    const enrolled = await enrollmentCollection.find({ studentEmail }).toArray();
    res.send(enrolled);
  } catch (err) {
    res.status(500).send({ message: 'Failed to fetch enrolled classes' });
  }
});



    // Get total class count
   



app.get('/enrollment-count/:classId', async (req, res) => {
  try {
    const classId = req.params.classId;

  
    const count = await enrollmentCollection.countDocuments({ classId });

    res.status(200).json({ classId, totalEnrollments: count });
  } catch (error) {
    console.error('Error fetching enrollment count:', error);
    res.status(500).json({ error: 'Failed to fetch enrollment count' });
  }
});





// Express.js example
app.get('/enrollments/:email', async (req, res) => {
  const email = req.params.email;
  try {
    const enrollments = await enrollmentCollection.find({ studentEmail: email }).toArray();
    res.send(enrollments);
  } catch (error) {
    res.status(500).send({ message: "Server error" });
  }
});


   



   // ✅ User POST API - with email lowercase
app.post('/users', async (req, res) => {
  const user = req.body;


  user.email = user.email.toLowerCase();

  const existing = await userCollection.findOne({ email: user.email });
  if (existing) return res.send({ message: "User already exists" });

  // ✅ Default role if not provided
  if (!user.role) user.role = 'student';

  const result = await userCollection.insertOne(user);
  res.send(result);
});



// popular classes API
// ✅ Get approved classes sorted by totalEnrollment descending
app.get('/popular-classes',  async (req, res) => {
  try {
    const classes = await classCollection
      .find({ status: 'approved' }) // approved class only
      .sort({ totalEnrollment: -1 }) // highest first
      .limit(6) // top 6 popular classes
      .toArray();

    res.send(classes);
  } catch (error) {
    console.error("❌ Error getting popular classes:", error.message);
    res.status(500).send({ error: "Failed to fetch popular classes" });
  }
});



        // Get total user count
        app.get('/stats/total-users', async (req, res) => {
          try {
            const count = await userCollection.countDocuments();
            res.send({ totalUsers: count });
          } catch (error) {
            res.status(500).send({ error: 'Failed to fetch user count' });
          }
        });

        // Get total enrollment count
        app.get('/stats/total-enrollments', async (req, res) => {
          try {
            const count = await enrollmentCollection.countDocuments();
            res.send({ totalEnrollments: count });
          } catch (error) {
            res.status(500).send({ error: 'Failed to fetch enrollment count' });
          }
        });




         app.get('/stats/total-classes', async (req, res) => {
      try {
        const count = await classCollection.countDocuments();
        res.send({ totalClasses: count });
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch class count' });
      }
    });


app.get('/classes/approved',   async (req, res) => {
  try {
    const approvedClasses = await classCollection
      .find({ status: 'approved' })
      .sort({ totalEnrollment: -1 }) // Optional: popular first
      .toArray();
    res.send(approvedClasses);
  } catch (error) {
    res.status(500).send({ error: 'Failed to fetch approved classes' });
  }
});








    



    // 📁 index.js or users.route.js
app.get('/users/role/:email', async (req, res) => {
  const { email } = req.params;

  try {
    const user = await userCollection.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: 'User not found', role: null });
    }

    res.send({ role: user.role || 'student' }); // default to student if role not set
  } catch (error) {
    console.error('❌ Error fetching user role:', error);
    res.status(500).send({ message: 'Server error', role: null });
  }
});


    app.put('/users/role/teacher/:email', async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.updateOne(
        { email },
        { $set: { role: 'teacher' } }
      );
      res.send(result);
    });

  

// GET user by email or name (query based search)
app.get('/users/search', async (req, res) => {
  const { q } = req.query;

  if (!q) return res.status(400).send({ message: "Search query missing" });

  const query = {
    $or: [
      { email: { $regex: q, $options: 'i' } },
      { name: { $regex: q, $options: 'i' } },
    ],
  };

  try {
    const user = await userCollection.findOne(query);
    if (!user) return res.status(404).send({ message: "User not found" });
    res.send(user);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).send({ message: "Server error" });
  }
});








// Make Admin
app.put('/users/role/admin/:email', verifyAdmin,  async (req, res) => {
  const email = req.params.email;
  const result = await userCollection.updateOne(
    { email },
    { $set: { role: 'admin' } }
  );
  res.send(result);
});

// Remove Admin
app.put('/users/role/remove-admin/:email', async (req, res) => {
  const email = req.params.email;
  const result = await userCollection.updateOne(
    { email },
    { $set: { role: 'student' } } // or 'user'
  );
  res.send(result);
});


// user collection
app.post('/users', async (req, res) => {
  const user = req.body;

  // Step 1: একই ইমেইল আছে কিনা চেক করে
  const existingUser = await userCollection.findOne({ email: user.email });

  // Step 2: যদি আগে থেকেই থাকে, তাহলে insert না করে message দেয়
  if (existingUser) {
    return res.send({ message: 'User already exists' });
  }

  // Step 3: যদি না থাকে, তাহলে insert করে
  const result = await userCollection.insertOne(user);
  res.send(result); // { acknowledged: true, insertedId: ... }
});






    // Teacher Request APIs
    app.post('/teacher-requests', async (req, res) => {
      const request = req.body;
      request.status = 'pending';
      const result = await teacherRequestCollection.insertOne(request);
      res.send(result);
    });

    app.get('/teacher-requests/:email', async (req, res) => {
      const email = req.params.email;
      const request = await teacherRequestCollection.findOne({ email });
      res.send(request);
    });

    app.get('/teacher-requests',  async (req, res) => {
      const result = await teacherRequestCollection.find().toArray();
      res.send(result);
    });

    app.patch('/teacher-requests/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = { $set: { status } };
      const request = await teacherRequestCollection.findOne(filter);

      if (!request) return res.status(404).send({ message: 'Request not found' });

      if (status === 'accepted' && request.email) {
        await userCollection.updateOne(
          { email: request.email },
          { $set: { role: 'teacher' } }
        );
      }

      const result = await teacherRequestCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put('/teacher-requests/:id/reject', async (req, res) => {
      const id = req.params.id;
      const result = await teacherRequestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected' } }
      );
      res.send(result);
    });





    // Get approved teachers
      app.get('/approved-teachers', async (req, res) => {
  try {
    const teachers = await userCollection.find({ role: 'teacher' }).toArray();
    res.send(teachers);
  } catch (error) {
    console.error('Error fetching approved teachers:', error);
    res.status(500).send({ error: 'Failed to fetch approved teachers' });
  }
   });










    // Class APIs
    app.post('/classes',  async (req, res) => {
      const newClass = req.body;
      newClass.status = 'pending';
      const result = await classCollection.insertOne(newClass);
      res.send(result);
    });

    app.get('/approveclasses',  async (req, res) => {
      const status = req.query.status;
      const query = status ? { status } : {};
      try {
        const classes = await classCollection.find(query).toArray();
        // For approved classes, add totalEnrollment count from enrollments
        if (status === 'approved') {
          // Get all enrollments grouped by classId
          const enrollCounts = await enrollmentCollection.aggregate([
            { $group: { _id: "$classId", count: { $sum: 1 } } }
          ]).toArray();
          // Map classId to count
          const enrollMap = {};
          enrollCounts.forEach(e => { enrollMap[e._id] = e.count; });
          // Attach count to each class
          classes.forEach(cls => {
            cls.totalEnrollment = enrollMap[cls._id?.toString()] || 0;
          });
        }
        res.send(classes);
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch classes' });
      }
    });

    app.get('/classes/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const classItem = await classCollection.findOne({ _id: new ObjectId(id) });
        if (!classItem) return res.status(404).send({ message: 'Class not found' });
        res.send(classItem);
      } catch (error) {
        res.status(500).send({ error: 'Internal Server Error' });
      }
    });

    app.get('/classes/instructor/:email', async (req, res) => {
      const email = req.params.email;
      const result = await classCollection.find({ email }).toArray();
      res.send(result);
    });

    app.put('/approveclasses/:id/approve', async (req, res) => {
      const id = req.params.id;
      const result = await classCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'approved' } }
      );
      res.send(result);
    });

    app.put('/approveclasses/:id/reject', async (req, res) => {
      const id = req.params.id;
      const result = await classCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected' } }
      );
      res.send(result);
    });


// DELETE a class by ID
app.delete('/classes/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const result = await classCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 1) {
      res.send({ success: true, message: "Class deleted successfully", deletedCount: 1 });
    } else {
      res.status(404).send({ success: false, message: "Class not found" });
    }
  } catch (error) {
    console.error("❌ Error deleting class:", error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
});



// Example: Update class by ID
app.put('/classes/:id', async (req, res) => {
  const { id } = req.params;
  const updatedData = { ...req.body };

 
  if (updatedData._id) {
    delete updatedData._id;
  }

  try {
    const result = await classCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );
    res.send(result);
  } catch (error) {
    console.error("❌ Update Error:", error);
    res.status(500).send({ message: "Server error", error });
  }
});








// all user api:
app.get('/users', async (req, res) => {
  try {
    const search = req.query.search || "";
    let query = {};

    if (search) {
      // Search by name or email (case-insensitive)
      query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } }
        ]
      };
    }

    const users = await userCollection.find(query).toArray();
    res.send(users);

  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).send({ error: "Internal server error" });
  }
});
















// payment api






app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body;
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});






app.get('/enrollments', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).send({ message: 'Missing email query param' });

  try {
    const enrollments = await enrollmentCollection.find({ studentEmail: email }).toArray();
    res.send(enrollments);
  } catch (error) {
    res.status(500).send({ message: 'Failed to fetch enrollments' });
  }
});






// Student submits assignment
app.post('/assignments', async (req, res) => {
  const assignmentData = req.body;
  const result = await assignmentCollection.insertOne(assignmentData);
  res.send(result);
});




app.get('/assignments/:id', async (req, res) => {
  const classId = req.params.classId;
  try {
    const assignments = await assignmentCollection.find({ classId: classId }).toArray();
    if (!assignments.length) {
      return res.status(404).send({ message: 'No assignments found for this class' });
    }
    res.send(assignments);
  } catch (error) {
    res.status(500).send({ message: 'Server error' });
  }
});







  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('✅ Edu Manage Server is Running');
});

app.listen(port, () => {
  console.log(`🚀 Edu Manage Server is running on port ${port}`);
});
