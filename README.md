# Bank Statement & PhonePe Transaction Analyzer

A secure, 100% client-side web application to analyze and categorize transaction statements (PhonePe, HDFC, ICICI, SBI, etc.) from PDF or CSV exports. All file reading, text extraction, and parsing occur entirely in your browser—no financial data is ever uploaded to a server.

## Features
- **Secure Local Processing**: Statement parsing happens client-side using PDF.js and custom regex-based extractors.
- **Universal Bank Support**: Supports PhonePe statements, HDFC, ICICI, SBI, and standard CSV exports.
- **Light / Dark Theme Toggling**: Seamless theme transitions with custom glassmorphic styling and automated Chart.js grid/tick adaptation.
- **Top Spending Merchants Grid**: Dynamic aggregation and high-accuracy extraction of top outlets (e.g., Swiggy, Zomato, Amazon) with progress indicators.
- **Month-wise Segregation**: Visual overview of cash flows (spent, received, net savings) grouped by month.
- **Advanced Interactive Analytics**: Doughnut and Trend charts synced with table search filters and category overrides.

---

## Local Setup

To run the application locally, you can use any static file server. For example, using Python:

```bash
# Start a local HTTP server
python -m http.server 8080
```

Then open your browser and navigate to `http://localhost:8080`.

---

## Automated Deployment to Render (via GitHub)

Follow these steps to deploy this application to Render so that anyone can access it:

### Step 1: Push the Code to your GitHub
1. Log into your **GitHub** account.
2. Create a new public or private repository named `bank-statement-analyzer`.
3. Link your local repository and push the code:
   ```bash
   # Rename default branch to main
   git branch -M main

   # Add your GitHub remote URL (replace <your-username> with your GitHub username)
   git remote add origin https://github.com/<your-username>/bank-statement-analyzer.git

   # Push to main
   git push -u origin main
   ```

### Step 2: Configure Render for Free Static Site Hosting
1. Sign up or log in to [Render](https://render.com) using your GitHub account.
2. Click the **New +** button on your dashboard and select **Static Site**.
3. Locate the list of GitHub repositories and connect the `bank-statement-analyzer` repository.
4. Set the following build settings:
   - **Name**: `bank-statement-analyzer` (or your preferred name)
   - **Build Command**: *Leave blank*
   - **Publish Directory**: `.` (input a single dot to publish the root directory)
5. Click **Create Static Site**.

Render will fetch the code, build it instantly, and provide a public URL (e.g., `https://bank-statement-analyzer.onrender.com`). Every time you push updates to GitHub, Render will automatically rebuild and deploy your changes.
