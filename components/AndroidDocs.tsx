
import React from 'react';

const AndroidDocs: React.FC = () => {
  return (
    <div className="p-6 bg-white rounded-xl shadow-sm space-y-8 overflow-y-auto max-h-[80vh]">
      <section>
        <h2 className="text-2xl font-bold text-blue-600 mb-4">Link Checker Android Architecture</h2>
        <p className="mb-2 text-gray-700">We use the <strong>MVVM (Model-View-ViewModel)</strong> pattern combined with <strong>Clean Architecture</strong> principles for scalability.</p>
        <ul className="list-disc ml-6 space-y-1 text-gray-600">
          <li><strong>UI Layer (Compose/Activity):</strong> Observes ViewModel State.</li>
          <li><strong>Domain Layer (UseCase):</strong> Business logic for checking links.</li>
          <li><strong>Data Layer (Room + OkHttp/Retrofit):</strong> Local persistence and network requests.</li>
        </ul>
      </section>

      {/* NEW GITHUB UPDATE SECTION */}
      <section className="border-l-4 border-indigo-500 pl-4 bg-indigo-50/30 py-4 pr-4 rounded-r-xl">
        <h2 className="text-xl font-black mb-4 text-indigo-800 flex items-center gap-2">
          <i className="fab fa-github"></i> GitHub Auto Update Feature
        </h2>
        <p className="text-sm text-slate-600 mb-4 italic">Automatically fetch and merge links from GitHub RAW repository.</p>
        
        <h3 className="font-bold text-slate-700 mt-4 mb-2">1. Retrofit Service (Kotlin)</h3>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-indigo-700">
{`interface GithubApiService {
    @GET("sakibzzz641/ftpchecker/main/BDIX_url.txt")
    suspend fun getLinksFromGithub(): ResponseBody
}

object RetrofitInstance {
    private const val BASE_URL = "https://raw.githubusercontent.com/"
    val api: GithubApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .build()
            .create(GithubApiService::class.java)
    }
}`}
        </pre>

        <h3 className="font-bold text-slate-700 mt-4 mb-2">2. Parsing & Room Merge Logic</h3>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-slate-800">
{`suspend fun updateLinksFromGithub() {
    try {
        val response = RetrofitInstance.api.getLinksFromGithub()
        val content = response.string()
        val lines = content.lines().map { it.trim() }.filter { it.isNotEmpty() }
        
        val newLinks = lines.filter { it.startsWith("http") }
        
        // DAO logic: use 'INSERT OR IGNORE' strategy
        val entities = newLinks.map { url -> 
            LinkEntity(url = url, category = "Remote", status = "IDLE") 
        }
        linkDao.insertAll(entities) // Room handles duplicates via OnConflictStrategy.IGNORE
    } catch (e: Exception) {
        // Handle network/parsing errors
    }
}`}
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2 text-slate-800">Storage Management (Import/Export TXT)</h2>
        <p className="text-sm text-slate-600 mb-4">Use <strong>Storage Access Framework (SAF)</strong> for Scoped Storage compatibility. Do not request broad READ/WRITE permissions.</p>
        
        <h3 className="font-bold text-slate-700 mt-4 mb-2">1. Export Logic (Kotlin)</h3>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-blue-800">
{`fun exportLinks(context: Context, links: List<String>) {
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "text/plain"
        putExtra(Intent.EXTRA_TITLE, "links_export_\${System.currentTimeMillis()}.txt")
    }
    // Handle result in ActivityResultLauncher
    // writeToFile(uri, links.joinToString("\\n"))
}`}
        </pre>

        <h3 className="font-bold text-slate-700 mt-4 mb-2">2. Import Logic (Kotlin)</h3>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-green-800">
{`fun importLinks(uri: Uri, contentResolver: ContentResolver) {
    contentResolver.openInputStream(uri)?.use { inputStream ->
        val reader = inputStream.bufferedReader()
        val links = reader.readLines()
            .map { it.trim() }
            .filter { it.startsWith("https://") || it.startsWith("http://") }
            .distinct()
        
        // Save to Database via Repository/ViewModel
        viewModel.insertLinks(links)
    }
}`}
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Required Android Permissions</h2>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto">
{`<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" /> <!-- Required for SSID on Android 10+ -->
`}
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Room Database Schema (LinkEntity.kt)</h2>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-blue-800">
{`@Entity(tableName = "links", indices = [Index(value = ["url"], unique = true)])
data class LinkEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val url: String,
    val name: String = "",
    val category: String,
    val status: String, // WORKING, BLOCKED, SLOW, FAILED
    val latency: Long = 0,
    val lastCheckTimestamp: Long = 0,
    val isFavorite: Boolean = false
)`}
        </pre>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">Core Logic: HTTPS Check (Kotlin + OkHttp)</h2>
        <pre className="bg-gray-100 p-4 rounded-lg text-sm font-mono overflow-x-auto text-green-800">
{`suspend fun checkUrl(url: String): LinkResult {
    val client = OkHttpClient.Builder()
        .connectTimeout(5, TimeUnit.SECONDS)
        .readTimeout(5, TimeUnit.SECONDS)
        .build()

    val request = Request.Builder()
        .url(url)
        .head() // Use HEAD for efficiency
        .build()

    val startTime = System.currentTimeMillis()
    return try {
        client.newCall(request).execute().use { response ->
            val latency = System.currentTimeMillis() - startTime
            LinkResult(
                statusCode = response.code,
                latency = latency,
                isSuccessful = response.isSuccessful
            )
        }
    } catch (e: Exception) {
        LinkResult(isError = true, errorMsg = e.message)
    }
}`}
        </pre>
      </section>
    </div>
  );
};

export default AndroidDocs;
