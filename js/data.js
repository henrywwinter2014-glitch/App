/*
 * Security universe for the simulator.
 *
 * Line format:  TICKER|Name|start price|dividend yield %|flags
 * Flags (optional, any order):
 *   n = listed on NASDAQ (default NYSE, or LSE for UK)
 *   b = blue chip (mega cap)
 *   r = dividend aristocrat (25+ years of increases)
 *   h = high volatility
 *   M / S / A = pays monthly / semi-annually / annually (default quarterly)
 *
 * Start prices are approximate reference levels. Everything after day one is simulated.
 */
window.MARKET_DATA = {
  stocks: {
    "Technology": `
AAPL|Apple|230|0.44|nb
MSFT|Microsoft|510|0.65|nb
NVDA|NVIDIA|180|0.02|nbh
AVGO|Broadcom|330|0.7|nb
ORCL|Oracle|290|0.6|b
CRM|Salesforce|245|0.7|
ADBE|Adobe|350|0|n
AMD|Advanced Micro Devices|160|0|nh
CSCO|Cisco Systems|68|2.4|n
ACN|Accenture|245|2.4|
IBM|IBM|280|2.4|r
INTU|Intuit|670|0.6|n
TXN|Texas Instruments|185|2.9|n
QCOM|Qualcomm|160|2.2|n
NOW|ServiceNow|920|0|
AMAT|Applied Materials|190|0.9|n
MU|Micron Technology|180|0.3|nh
ADI|Analog Devices|245|1.6|n
LRCX|Lam Research|130|0.7|n
KLAC|KLA Corp|950|0.8|n
INTC|Intel|36|0|nh
PANW|Palo Alto Networks|200|0|n
ANET|Arista Networks|140|0|
SNPS|Synopsys|450|0|n
CDNS|Cadence Design|345|0|n
CRWD|CrowdStrike|480|0|nh
APH|Amphenol|120|0.5|
MSI|Motorola Solutions|460|0.9|
ROP|Roper Technologies|500|0.6|n
FTNT|Fortinet|85|0|n
ADSK|Autodesk|315|0|n
WDAY|Workday|230|0|n
NXPI|NXP Semiconductors|225|1.8|n
MCHP|Microchip Technology|65|2.8|n
TEL|TE Connectivity|215|1.3|
IT|Gartner|250|0|
CTSH|Cognizant|68|1.8|n
GLW|Corning|82|1.4|
HPQ|HP Inc|27|4.2|
HPE|Hewlett Packard Enterprise|24|2.2|
DELL|Dell Technologies|135|1.5|
ON|ON Semiconductor|50|0|n
MPWR|Monolithic Power|900|0.7|n
FICO|Fair Isaac|1500|0|
KEYS|Keysight|170|0|
CDW|CDW Corp|160|1.6|n
TYL|Tyler Technologies|560|0|
PTC|PTC Inc|205|0|n
TER|Teradyne|135|0.4|n
NTAP|NetApp|115|1.9|n
WDC|Western Digital|110|0.4|nh
STX|Seagate Technology|210|1.4|n
ZBRA|Zebra Technologies|300|0|n
TDY|Teledyne|560|0|
SWKS|Skyworks Solutions|75|3.7|n
JBL|Jabil|210|0.2|
FFIV|F5 Inc|330|0|n
AKAM|Akamai|75|0|n
GEN|Gen Digital|29|1.7|n
EPAM|EPAM Systems|160|0|
ENPH|Enphase Energy|36|0|nh
FSLR|First Solar|220|0|nh
SMCI|Super Micro Computer|45|0|nh
PLTR|Palantir Technologies|180|0|nbh
TRMB|Trimble|80|0|n
VRSN|VeriSign|280|1.1|n
GDDY|GoDaddy|145|0|
DDOG|Datadog|140|0|nh
APP|AppLovin|600|0|nh
SNOW|Snowflake|230|0|h
NET|Cloudflare|210|0|h
ZS|Zscaler|290|0|nh
MDB|MongoDB|320|0|nh
TEAM|Atlassian|160|0|nh
MRVL|Marvell Technology|80|0.3|nh
MSTR|Strategy (MicroStrategy)|330|0|nh
DOCU|DocuSign|75|0|n
TWLO|Twilio|105|0|h
OKTA|Okta|90|0|n
HUBS|HubSpot|470|0|
U|Unity Software|40|0|h
IONQ|IonQ|60|0|h
SNDK|SanDisk|110|0|nh
`,
    "Communication Services": `
GOOGL|Alphabet Class A|245|0.35|nb
GOOG|Alphabet Class C|246|0.35|nb
META|Meta Platforms|720|0.3|nb
NFLX|Netflix|1200|0|n
DIS|Walt Disney|112|0.9|
CMCSA|Comcast|31|4.2|n
T|AT&T|27|4.1|
VZ|Verizon|43|6.3|
TMUS|T-Mobile US|240|1.5|n
CHTR|Charter Communications|270|0|n
EA|Electronic Arts|200|0.4|n
TTWO|Take-Two Interactive|255|0|n
WBD|Warner Bros Discovery|19|0|n
OMC|Omnicom Group|75|3.7|
LYV|Live Nation|160|0|
FOXA|Fox Corp Class A|58|0.9|n
FOX|Fox Corp Class B|52|1|n
NWSA|News Corp Class A|30|0.7|n
NWS|News Corp Class B|34|0.6|n
MTCH|Match Group|35|2.2|n
PSKY|Paramount Skydance|18|1.1|n
PINS|Pinterest|34|0|
SNAP|Snap Inc|8|0|h
RDDT|Reddit|230|0|h
RBLX|Roblox|130|0|h
SPOT|Spotify|700|0|h
TKO|TKO Group|200|0.8|
SIRI|Sirius XM|22|4.9|n
`,
    "Consumer Discretionary": `
AMZN|Amazon|225|0|nb
TSLA|Tesla|430|0|nbh
HD|Home Depot|410|2.3|b
MCD|McDonald's|305|2.4|r
LOW|Lowe's|255|1.9|r
BKNG|Booking Holdings|5400|0.7|n
TJX|TJX Companies|140|1.2|
SBUX|Starbucks|85|2.9|n
NKE|Nike|70|2.3|
CMG|Chipotle|40|0|
ORLY|O'Reilly Automotive|100|0|n
AZO|AutoZone|4100|0|
MAR|Marriott|265|1|n
HLT|Hilton|270|0.2|
ABNB|Airbnb|125|0|n
GM|General Motors|58|1|
F|Ford Motor|12|5|
ROST|Ross Stores|150|1.1|n
DHI|D.R. Horton|165|1|
LEN|Lennar|125|1.6|
PHM|PulteGroup|130|0.7|
NVR|NVR Inc|7800|0|
YUM|Yum! Brands|148|1.9|
DRI|Darden Restaurants|190|3.2|
RCL|Royal Caribbean|330|1.1|h
CCL|Carnival|30|0|h
NCLH|Norwegian Cruise Line|24|0|h
EXPE|Expedia|215|0.7|n
EBAY|eBay|90|1.3|n
TSCO|Tractor Supply|57|1.6|n
ULTA|Ulta Beauty|520|0|n
DPZ|Domino's Pizza|430|1.6|n
GPC|Genuine Parts|140|2.9|r
LKQ|LKQ Corp|30|4|n
POOL|Pool Corp|310|1.6|n
BBY|Best Buy|75|5|
KMX|CarMax|45|0|
APTV|Aptiv|85|0|
BWA|BorgWarner|43|1.6|
DECK|Deckers Outdoor|105|0|
LULU|Lululemon|170|0|n
RL|Ralph Lauren|310|1.1|
TPR|Tapestry|110|1.4|
HAS|Hasbro|78|3.6|n
MGM|MGM Resorts|35|0|
WYNN|Wynn Resorts|125|0.8|n
LVS|Las Vegas Sands|52|1.9|
CZR|Caesars Entertainment|26|0|n
GRMN|Garmin|245|1.5|
WSM|Williams-Sonoma|195|1.3|
DASH|DoorDash|260|0|n
RIVN|Rivian Automotive|14|0|nh
LCID|Lucid Group|20|0|nh
CVNA|Carvana|370|0|h
CHWY|Chewy|38|0|
ETSY|Etsy|60|0|n
W|Wayfair|80|0|h
PTON|Peloton|8|0|nh
GME|GameStop|25|0|h
HOG|Harley-Davidson|28|2.5|
M|Macy's|18|4|
KSS|Kohl's|15|3.3|h
GAP|Gap Inc|22|3|
DKS|Dick's Sporting Goods|220|2.2|
`,
    "Consumer Staples": `
WMT|Walmart|100|0.9|rb
COST|Costco|920|0.55|nb
PG|Procter & Gamble|155|2.7|rb
KO|Coca-Cola|68|3|rb
PEP|PepsiCo|145|3.9|nr
PM|Philip Morris International|160|3.6|
MO|Altria Group|65|6.4|
MDLZ|Mondelez|62|3.2|n
CL|Colgate-Palmolive|80|2.6|r
TGT|Target|90|5|r
KMB|Kimberly-Clark|122|4.1|r
GIS|General Mills|50|4.8|
KHC|Kraft Heinz|26|6.1|n
STZ|Constellation Brands|135|3|
SYY|Sysco|80|2.7|r
KR|Kroger|67|2|
HSY|Hershey|185|3|
KDP|Keurig Dr Pepper|27|3.4|n
MNST|Monster Beverage|65|0|n
ADM|Archer-Daniels-Midland|60|3.4|r
CHD|Church & Dwight|88|1.3|r
CLX|Clorox|120|4.1|r
K|Kellanova|80|2.9|
MKC|McCormick|67|2.7|r
HRL|Hormel Foods|25|4.6|r
CAG|Conagra Brands|18|7.6|
CPB|Campbell's|32|4.8|n
SJM|J.M. Smucker|108|4|
TSN|Tyson Foods|55|3.6|
KVUE|Kenvue|17|4.8|r
EL|Estee Lauder|88|1.6|
DG|Dollar General|105|2.2|
DLTR|Dollar Tree|95|0|n
BG|Bunge Global|82|3.4|
TAP|Molson Coors|46|4.1|
LW|Lamb Weston|55|2.7|
BF.B|Brown-Forman|28|3.2|r
`,
    "Health Care": `
LLY|Eli Lilly|800|0.75|b
UNH|UnitedHealth Group|350|2.5|b
JNJ|Johnson & Johnson|185|2.8|rb
ABBV|AbbVie|220|3|rb
MRK|Merck|85|3.8|
ABT|Abbott Laboratories|133|1.8|r
TMO|Thermo Fisher Scientific|520|0.3|
ISRG|Intuitive Surgical|450|0|n
DHR|Danaher|200|0.6|
AMGN|Amgen|290|3.3|n
PFE|Pfizer|25|6.9|
BSX|Boston Scientific|100|0|
SYK|Stryker|380|0.9|
GILD|Gilead Sciences|115|2.8|n
VRTX|Vertex Pharmaceuticals|400|0|n
MDT|Medtronic|95|3|r
BMY|Bristol-Myers Squibb|45|5.5|
ELV|Elevance Health|330|2|
CI|Cigna Group|290|2.1|
HCA|HCA Healthcare|420|0.7|
MCK|McKesson|700|0.4|
CVS|CVS Health|75|3.5|
REGN|Regeneron|560|0.6|n
ZTS|Zoetis|145|1.4|
BDX|Becton Dickinson|190|2.2|r
EW|Edwards Lifesciences|80|0|
COR|Cencora|290|0.8|
IDXX|IDEXX Laboratories|640|0|n
A|Agilent Technologies|125|0.8|
IQV|IQVIA|190|0|
GEHC|GE HealthCare|75|0.2|n
HUM|Humana|270|1.3|
RMD|ResMed|275|0.9|
CNC|Centene|35|0|h
DXCM|Dexcom|70|0|n
MTD|Mettler-Toledo|1250|0|
BIIB|Biogen|140|0|n
WST|West Pharmaceutical|260|0.3|r
ZBH|Zimmer Biomet|100|1|
STE|Steris|245|1|
CAH|Cardinal Health|150|1.4|r
LH|Labcorp|280|1|
DGX|Quest Diagnostics|180|1.8|
HOLX|Hologic|70|0|n
COO|Cooper Companies|70|0|n
BAX|Baxter International|23|3|
WAT|Waters Corp|320|0|
MRNA|Moderna|25|0|nh
ALGN|Align Technology|130|0|n
PODD|Insulet|330|0|n
INCY|Incyte|80|0|n
MOH|Molina Healthcare|190|0|
VTRS|Viatris|10|4.8|n
TECH|Bio-Techne|55|0.6|n
CRL|Charles River Labs|160|0|
SOLV|Solventum|72|0|
HSIC|Henry Schein|68|0|n
UHS|Universal Health Services|180|0.4|
DVA|DaVita|135|0|
HIMS|Hims & Hers Health|50|0|h
`,
    "Financials": `
BRK.A|Berkshire Hathaway Class A|735000|0|b
BRK.B|Berkshire Hathaway Class B|490|0|b
JPM|JPMorgan Chase|300|1.9|b
V|Visa|345|0.7|b
MA|Mastercard|570|0.5|b
BAC|Bank of America|50|2.1|
WFC|Wells Fargo|82|2.1|
GS|Goldman Sachs|780|2|
MS|Morgan Stanley|155|2.6|
AXP|American Express|340|0.9|
SCHW|Charles Schwab|95|1.1|
C|Citigroup|100|2.4|
BLK|BlackRock|1150|1.8|
SPGI|S&P Global|490|0.8|r
PGR|Progressive|245|0.2|
CB|Chubb|280|1.4|r
MMC|Marsh McLennan|200|1.8|
ICE|Intercontinental Exchange|165|1.2|
CME|CME Group|270|1.9|n
BX|Blackstone|170|2.7|
KKR|KKR & Co|130|0.6|
PNC|PNC Financial|195|3.5|
USB|U.S. Bancorp|48|4.2|
AON|Aon|360|0.8|
MCO|Moody's|480|0.8|
COF|Capital One|215|1.1|
TFC|Truist Financial|45|4.6|
AJG|Arthur J. Gallagher|290|0.9|
MET|MetLife|80|2.8|
AIG|American International Group|78|2.3|
PRU|Prudential Financial|105|5.1|
AFL|Aflac|110|2.1|r
ALL|Allstate|200|2|
TRV|Travelers|275|1.6|
BK|BNY Mellon|105|1.8|
AMP|Ameriprise Financial|490|1.3|
FIS|Fidelity National Info|65|2.5|
FI|Fiserv|125|0|
PYPL|PayPal|70|0|n
MSCI|MSCI Inc|560|1.3|
HIG|Hartford Financial|130|1.6|
NDAQ|Nasdaq Inc|90|1.2|n
STT|State Street|115|2.8|
MTB|M&T Bank|190|3|
FITB|Fifth Third Bancorp|44|3.6|n
RJF|Raymond James|165|1.2|
HBAN|Huntington Bancshares|17|3.7|n
RF|Regions Financial|26|4.1|
CFG|Citizens Financial|52|3.3|
NTRS|Northern Trust|130|2.4|n
KEY|KeyCorp|18|4.5|
SYF|Synchrony Financial|72|1.6|
CINF|Cincinnati Financial|155|2.2|nr
WRB|W. R. Berkley|70|0.5|
L|Loews|100|0.3|
BRO|Brown & Brown|95|0.7|r
FDS|FactSet|290|1.5|r
GPN|Global Payments|85|1.2|
CPAY|Corpay|330|0|
TROW|T. Rowe Price|105|4.8|nr
BEN|Franklin Resources|24|5.3|r
IVZ|Invesco|22|3.8|
EG|Everest Group|340|2.4|
GL|Globe Life|140|0.7|
AIZ|Assurant|210|1.5|
ERIE|Erie Indemnity|360|1.5|n
ACGL|Arch Capital|90|0|n
MKTX|MarketAxess|180|1.7|n
COIN|Coinbase|330|0|nh
HOOD|Robinhood Markets|130|0|nh
APO|Apollo Global|135|1.5|
ARES|Ares Management|170|2.5|
IBKR|Interactive Brokers|65|0.5|n
XYZ|Block Inc|75|0|h
SOFI|SoFi Technologies|26|0|nh
ALLY|Ally Financial|40|3|
MAIN|Main Street Capital (BDC)|62|6.5|M
ARCC|Ares Capital (BDC)|21|9|n
`,
    "Industrials": `
GE|GE Aerospace|290|0.5|b
CAT|Caterpillar|470|1.2|r
RTX|RTX Corp|160|1.7|
UBER|Uber Technologies|95|0|h
HON|Honeywell|210|2.2|n
UNP|Union Pacific|230|2.4|
BA|Boeing|220|0|
ETN|Eaton|370|1.1|
DE|Deere & Co|460|1.4|
LMT|Lockheed Martin|490|2.7|
ADP|Automatic Data Processing|290|2.1|nr
UPS|United Parcel Service|85|7.7|
GD|General Dynamics|330|1.8|r
NOC|Northrop Grumman|590|1.5|
WM|Waste Management|220|1.5|
TT|Trane Technologies|420|0.9|
PH|Parker-Hannifin|760|0.9|
ITW|Illinois Tool Works|260|2.4|r
CTAS|Cintas|205|0.9|nr
MMM|3M|155|1.9|
TDG|TransDigm|1300|0|
EMR|Emerson Electric|135|1.6|r
CSX|CSX Corp|36|1.4|n
NSC|Norfolk Southern|285|1.9|
FDX|FedEx|235|2.5|
CARR|Carrier Global|60|1.5|
PCAR|Paccar|98|1.3|n
GWW|W. W. Grainger|980|0.9|r
JCI|Johnson Controls|110|1.3|
CPRT|Copart|46|0|n
RSG|Republic Services|230|1|
URI|United Rentals|950|0.8|
PWR|Quanta Services|400|0.1|
LHX|L3Harris|290|1.7|
FAST|Fastenal|48|1.8|nr
OTIS|Otis Worldwide|90|1.8|
AME|Ametek|185|0.7|
CMI|Cummins|420|1.9|
ODFL|Old Dominion Freight|140|0.8|n
PAYX|Paychex|130|3.3|n
VRSK|Verisk Analytics|260|0.7|n
AXON|Axon Enterprise|730|0|nh
HWM|Howmet Aerospace|190|0.2|
GEV|GE Vernova|600|0.2|h
ROK|Rockwell Automation|340|1.6|
IR|Ingersoll Rand|80|0.1|
XYL|Xylem|145|1.1|
EFX|Equifax|250|0.8|
WAB|Wabtec|195|0.5|
DAL|Delta Air Lines|58|1.3|
UAL|United Airlines|100|0|nh
LUV|Southwest Airlines|32|2.2|
AAL|American Airlines|13|0|nh
DOV|Dover|170|1.2|r
HUBB|Hubbell|430|1.2|
VLTO|Veralto|105|0.4|
BR|Broadridge|240|1.6|
LDOS|Leidos|180|0.9|
FTV|Fortive|52|0.5|
EXPD|Expeditors International|120|1.3|r
J|Jacobs Solutions|150|0.8|
BLDR|Builders FirstSource|130|0|
SNA|Snap-on|340|2.6|
TXT|Textron|82|0.1|
IEX|IDEX Corp|165|1.7|
MAS|Masco|72|1.7|
PNR|Pentair|108|0.9|r
CHRW|C.H. Robinson|130|1.9|nr
JBHT|J.B. Hunt|145|1.2|n
SWK|Stanley Black & Decker|75|4.4|r
ALLE|Allegion|175|1.2|
ROL|Rollins|57|1.2|
NDSN|Nordson|225|1.4|nr
AOS|A. O. Smith|72|2|r
GNRC|Generac|160|0|h
HII|Huntington Ingalls|280|2|
PAYC|Paycom|210|0.7|
RKLB|Rocket Lab|45|0|nh
JOBY|Joby Aviation|15|0|h
`,
    "Energy": `
XOM|Exxon Mobil|115|3.5|rb
CVX|Chevron|155|4.4|rb
COP|ConocoPhillips|92|3.4|
EOG|EOG Resources|120|3.3|
WMB|Williams Companies|60|3.3|
SLB|SLB (Schlumberger)|34|3.3|
KMI|Kinder Morgan|27|4.3|
OKE|ONEOK|72|5.7|
PSX|Phillips 66|130|3.6|
MPC|Marathon Petroleum|185|2|
VLO|Valero Energy|165|2.7|
OXY|Occidental Petroleum|45|2.1|
FANG|Diamondback Energy|145|2.8|n
BKR|Baker Hughes|47|1.9|n
HAL|Halliburton|23|2.9|
DVN|Devon Energy|34|2.8|
TRGP|Targa Resources|165|2.4|
CTRA|Coterra Energy|24|3.6|
EQT|EQT Corp|53|1.2|
EXE|Expand Energy|105|2.2|n
APA|APA Corp|23|4.3|n
TPL|Texas Pacific Land|920|0.7|
ET|Energy Transfer LP|17|7.7|
EPD|Enterprise Products Partners|31|7|
MPLX|MPLX LP|50|8|
`,
    "Materials": `
LIN|Linde|470|1.3|nr
SHW|Sherwin-Williams|345|0.9|r
APD|Air Products|280|2.5|r
ECL|Ecolab|270|1|r
FCX|Freeport-McMoRan|42|1.4|h
NEM|Newmont|80|1.2|
CTVA|Corteva|68|1|
DOW|Dow Inc|23|6|
DD|DuPont|75|2.1|
NUE|Nucor|140|1.6|r
PPG|PPG Industries|105|2.6|r
VMC|Vulcan Materials|290|0.7|
MLM|Martin Marietta|610|0.5|
IFF|International Flavors & Fragrances|65|2.4|
LYB|LyondellBasell|50|10.5|
IP|International Paper|47|3.9|
PKG|Packaging Corp of America|210|2.4|
BALL|Ball Corp|50|1.6|
AVY|Avery Dennison|170|2.2|
AMCR|Amcor|8.5|6|r
CF|CF Industries|90|2.2|
MOS|Mosaic|33|2.6|
ALB|Albemarle|85|1.9|rh
STLD|Steel Dynamics|140|1.4|n
SW|Smurfit Westrock|45|3.8|
EMN|Eastman Chemical|65|5.1|
AA|Alcoa|33|1.2|h
B|Barrick Mining|30|1.6|
`,
    "Utilities": `
NEE|NextEra Energy|75|3|
SO|Southern Company|95|3.1|
DUK|Duke Energy|123|3.5|
CEG|Constellation Energy|320|0.5|nh
AEP|American Electric Power|112|3.3|n
SRE|Sempra|88|2.9|
D|Dominion Energy|60|4.4|
EXC|Exelon|45|3.6|n
PCG|PG&E|15|0.7|
XEL|Xcel Energy|78|2.9|n
ED|Consolidated Edison|100|3.4|r
PEG|Public Service Enterprise|85|3|
WEC|WEC Energy|112|3.2|
EIX|Edison International|56|5.9|
ETR|Entergy|95|2.6|
VST|Vistra|200|0.5|h
DTE|DTE Energy|138|3.2|
AEE|Ameren|102|2.8|
PPL|PPL Corp|37|2.9|
ES|Eversource|70|4.2|
FE|FirstEnergy|45|3.8|
CNP|CenterPoint Energy|38|2.3|
ATO|Atmos Energy|170|2.1|r
CMS|CMS Energy|72|3|
NRG|NRG Energy|160|1.1|
AWK|American Water Works|140|2.3|
LNT|Alliant Energy|66|3.1|n
NI|NiSource|42|2.7|
EVRG|Evergy|72|3.7|n
PNW|Pinnacle West|90|4|
AES|AES Corp|14|5|
`,
    "Real Estate": `
PLD|Prologis|115|3.5|
AMT|American Tower|195|3.5|
EQIX|Equinix|800|2.3|n
WELL|Welltower|165|1.8|
SPG|Simon Property Group|180|4.7|
O|Realty Income|58|5.5|Mr
PSA|Public Storage|290|4.1|
DLR|Digital Realty|170|2.9|
CCI|Crown Castle|95|4.5|
VICI|VICI Properties|32|5.6|
EXR|Extra Space Storage|145|4.5|
AVB|AvalonBay|200|3.5|
EQR|Equity Residential|65|4.3|
IRM|Iron Mountain|100|3.1|
VTR|Ventas|68|2.8|
SBAC|SBA Communications|195|2.3|n
ARE|Alexandria Real Estate|80|6.6|
INVH|Invitation Homes|30|3.9|
MAA|Mid-America Apartment|140|4.3|
ESS|Essex Property Trust|255|4|r
KIM|Kimco Realty|22|4.6|
DOC|Healthpeak Properties|18|6.7|M
UDR|UDR Inc|37|4.6|
HST|Host Hotels & Resorts|17|4.7|n
CPT|Camden Property|108|3.9|
REG|Regency Centers|72|4|n
BXP|BXP Inc|75|3.7|
FRT|Federal Realty|100|4.5|r
STAG|STAG Industrial|36|4.1|M
AGNC|AGNC Investment (mREIT)|10|14|nM
NLY|Annaly Capital (mREIT)|21|13.5|
MPW|Medical Properties Trust|5.2|6.5|h
ADC|Agree Realty|73|4.2|M
NNN|NNN REIT|42|5.6|
WPC|W. P. Carey|65|5.5|
LTC|LTC Properties|35|6.5|M
EPR|EPR Properties|55|6.4|M
`,
  },

  // Exchange-traded funds, index funds, bond funds and leveraged / inverse products.
  // Fields: t, n, p (price), y (yield %), q (dividends/year), cat (category),
  //   beta (vs market), vol (annual), rate (bond-rate sensitivity), fac (extra factor), track/lev (leveraged)
  funds: [
    { t: "SPY", n: "SPDR S&P 500 ETF Trust", p: 660, y: 1.1, q: 4, cat: "Index ETF", beta: 1, vol: 0.16 },
    { t: "VOO", n: "Vanguard S&P 500 ETF", p: 605, y: 1.2, q: 4, cat: "Index ETF", beta: 1, vol: 0.16 },
    { t: "IVV", n: "iShares Core S&P 500 ETF", p: 662, y: 1.2, q: 4, cat: "Index ETF", beta: 1, vol: 0.16 },
    { t: "VTI", n: "Vanguard Total Stock Market ETF", p: 325, y: 1.2, q: 4, cat: "Index ETF", beta: 1.02, vol: 0.165 },
    { t: "QQQ", n: "Invesco QQQ (Nasdaq-100)", p: 600, y: 0.5, q: 4, cat: "Index ETF", beta: 1.2, vol: 0.22, sec: "Technology" },
    { t: "DIA", n: "SPDR Dow Jones Industrial Average ETF", p: 460, y: 1.5, q: 12, cat: "Index ETF", beta: 0.95, vol: 0.15 },
    { t: "IWM", n: "iShares Russell 2000 ETF", p: 240, y: 1.1, q: 4, cat: "Index ETF", beta: 1.2, vol: 0.23 },
    { t: "MDY", n: "SPDR S&P MidCap 400 ETF", p: 590, y: 1.2, q: 4, cat: "Index ETF", beta: 1.1, vol: 0.2 },
    { t: "IJR", n: "iShares Core S&P Small-Cap ETF", p: 115, y: 1.4, q: 4, cat: "Index ETF", beta: 1.2, vol: 0.22 },
    { t: "RSP", n: "Invesco S&P 500 Equal Weight ETF", p: 190, y: 1.5, q: 4, cat: "Index ETF", beta: 1, vol: 0.17 },
    { t: "VUG", n: "Vanguard Growth ETF", p: 470, y: 0.4, q: 4, cat: "Index ETF", beta: 1.15, vol: 0.21 },
    { t: "VTV", n: "Vanguard Value ETF", p: 185, y: 2.1, q: 4, cat: "Index ETF", beta: 0.9, vol: 0.15 },
    { t: "SCHG", n: "Schwab U.S. Large-Cap Growth ETF", p: 31, y: 0.4, q: 4, cat: "Index ETF", beta: 1.15, vol: 0.21 },
    { t: "VEA", n: "Vanguard FTSE Developed Markets ETF", p: 58, y: 2.8, q: 4, cat: "International ETF", beta: 0.8, vol: 0.16, fac: "intl" },
    { t: "VWO", n: "Vanguard FTSE Emerging Markets ETF", p: 52, y: 2.7, q: 4, cat: "International ETF", beta: 0.8, vol: 0.19, fac: "intl" },
    { t: "EFA", n: "iShares MSCI EAFE ETF", p: 92, y: 2.8, q: 2, cat: "International ETF", beta: 0.8, vol: 0.16, fac: "intl" },
    { t: "VXUS", n: "Vanguard Total International Stock ETF", p: 72, y: 2.9, q: 4, cat: "International ETF", beta: 0.8, vol: 0.16, fac: "intl" },
    { t: "ACWI", n: "iShares MSCI ACWI ETF", p: 135, y: 1.6, q: 2, cat: "International ETF", beta: 0.95, vol: 0.15, fac: "intl" },
    { t: "SCHD", n: "Schwab U.S. Dividend Equity ETF", p: 27, y: 3.8, q: 4, cat: "Dividend ETF", beta: 0.8, vol: 0.14 },
    { t: "VYM", n: "Vanguard High Dividend Yield ETF", p: 140, y: 2.6, q: 4, cat: "Dividend ETF", beta: 0.85, vol: 0.14 },
    { t: "VIG", n: "Vanguard Dividend Appreciation ETF", p: 210, y: 1.7, q: 4, cat: "Dividend ETF", beta: 0.9, vol: 0.14 },
    { t: "DGRO", n: "iShares Core Dividend Growth ETF", p: 67, y: 2.1, q: 4, cat: "Dividend ETF", beta: 0.9, vol: 0.14 },
    { t: "NOBL", n: "ProShares S&P 500 Dividend Aristocrats ETF", p: 105, y: 2, q: 4, cat: "Dividend ETF", beta: 0.8, vol: 0.14 },
    { t: "HDV", n: "iShares Core High Dividend ETF", p: 122, y: 3.3, q: 4, cat: "Dividend ETF", beta: 0.7, vol: 0.13 },
    { t: "SPYD", n: "SPDR Portfolio S&P 500 High Dividend ETF", p: 44, y: 4.3, q: 4, cat: "Dividend ETF", beta: 0.85, vol: 0.16 },
    { t: "SPHD", n: "Invesco S&P 500 High Div Low Vol ETF", p: 48, y: 3.6, q: 12, cat: "Dividend ETF", beta: 0.7, vol: 0.13 },
    { t: "JEPI", n: "JPMorgan Equity Premium Income ETF", p: 57, y: 7.5, q: 12, cat: "Income ETF", beta: 0.6, vol: 0.1 },
    { t: "JEPQ", n: "JPMorgan Nasdaq Equity Premium Income ETF", p: 57, y: 10, q: 12, cat: "Income ETF", beta: 0.85, vol: 0.15, sec: "Technology" },
    { t: "QYLD", n: "Global X Nasdaq-100 Covered Call ETF", p: 17, y: 12, q: 12, cat: "Income ETF", beta: 0.75, vol: 0.13, sec: "Technology" },
    { t: "XLK", n: "Technology Select Sector SPDR", p: 285, y: 0.6, q: 4, cat: "Sector ETF", beta: 1.2, vol: 0.24, sec: "Technology" },
    { t: "XLF", n: "Financial Select Sector SPDR", p: 53, y: 1.4, q: 4, cat: "Sector ETF", beta: 1.1, vol: 0.19, sec: "Financials" },
    { t: "XLE", n: "Energy Select Sector SPDR", p: 88, y: 3.2, q: 4, cat: "Sector ETF", beta: 0.9, vol: 0.24, sec: "Energy" },
    { t: "XLV", n: "Health Care Select Sector SPDR", p: 140, y: 1.6, q: 4, cat: "Sector ETF", beta: 0.75, vol: 0.15, sec: "Health Care" },
    { t: "XLY", n: "Consumer Discretionary Select Sector SPDR", p: 235, y: 0.7, q: 4, cat: "Sector ETF", beta: 1.15, vol: 0.22, sec: "Consumer Discretionary" },
    { t: "XLP", n: "Consumer Staples Select Sector SPDR", p: 80, y: 2.6, q: 4, cat: "Sector ETF", beta: 0.6, vol: 0.12, sec: "Consumer Staples" },
    { t: "XLI", n: "Industrial Select Sector SPDR", p: 150, y: 1.3, q: 4, cat: "Sector ETF", beta: 1.05, vol: 0.18, sec: "Industrials" },
    { t: "XLU", n: "Utilities Select Sector SPDR", p: 85, y: 2.8, q: 4, cat: "Sector ETF", beta: 0.5, vol: 0.16, sec: "Utilities", rate: 0.4 },
    { t: "XLRE", n: "Real Estate Select Sector SPDR", p: 42, y: 3.2, q: 4, cat: "Sector ETF", beta: 0.85, vol: 0.19, sec: "Real Estate", rate: 0.6 },
    { t: "XLB", n: "Materials Select Sector SPDR", p: 90, y: 1.9, q: 4, cat: "Sector ETF", beta: 1, vol: 0.18, sec: "Materials" },
    { t: "XLC", n: "Communication Services Select Sector SPDR", p: 115, y: 0.9, q: 4, cat: "Sector ETF", beta: 1, vol: 0.19, sec: "Communication Services" },
    { t: "VNQ", n: "Vanguard Real Estate ETF", p: 92, y: 3.9, q: 4, cat: "Sector ETF", beta: 0.85, vol: 0.19, sec: "Real Estate", rate: 0.6 },
    { t: "SMH", n: "VanEck Semiconductor ETF", p: 320, y: 0.4, q: 1, cat: "Sector ETF", beta: 1.5, vol: 0.32, sec: "Technology" },
    { t: "SOXX", n: "iShares Semiconductor ETF", p: 280, y: 0.6, q: 4, cat: "Sector ETF", beta: 1.5, vol: 0.32, sec: "Technology" },
    { t: "ARKK", n: "ARK Innovation ETF", p: 80, y: 0, q: 0, cat: "Thematic ETF", beta: 1.6, vol: 0.45, sec: "Technology" },
    { t: "GLD", n: "SPDR Gold Shares", p: 370, y: 0, q: 0, cat: "Commodity ETF", beta: 0.05, vol: 0.15, fac: "gold" },
    { t: "IAU", n: "iShares Gold Trust", p: 75, y: 0, q: 0, cat: "Commodity ETF", beta: 0.05, vol: 0.15, fac: "gold" },
    { t: "SLV", n: "iShares Silver Trust", p: 42, y: 0, q: 0, cat: "Commodity ETF", beta: 0.2, vol: 0.28, fac: "gold" },
    { t: "USO", n: "United States Oil Fund", p: 75, y: 0, q: 0, cat: "Commodity ETF", beta: 0.4, vol: 0.32, sec: "Energy" },
    { t: "IBIT", n: "iShares Bitcoin Trust ETF", p: 65, y: 0, q: 0, cat: "Crypto ETF", beta: 1.3, vol: 0.5, fac: "crypto" },
    { t: "ETHA", n: "iShares Ethereum Trust ETF", p: 32, y: 0, q: 0, cat: "Crypto ETF", beta: 1.5, vol: 0.65, fac: "crypto" },
    { t: "TQQQ", n: "ProShares UltraPro QQQ (3x)", p: 100, y: 0.7, q: 4, cat: "Leveraged ETF", track: "QQQ", lev: 3 },
    { t: "SQQQ", n: "ProShares UltraPro Short QQQ (-3x)", p: 15, y: 0, q: 0, cat: "Inverse ETF", track: "QQQ", lev: -3 },
    { t: "UPRO", n: "ProShares UltraPro S&P 500 (3x)", p: 105, y: 0.6, q: 4, cat: "Leveraged ETF", track: "SPY", lev: 3 },
    { t: "SSO", n: "ProShares Ultra S&P 500 (2x)", p: 110, y: 0.6, q: 4, cat: "Leveraged ETF", track: "SPY", lev: 2 },
    { t: "SH", n: "ProShares Short S&P 500 (-1x)", p: 38, y: 0, q: 0, cat: "Inverse ETF", track: "SPY", lev: -1 },
    { t: "SOXL", n: "Direxion Daily Semiconductor Bull 3x", p: 30, y: 0.5, q: 4, cat: "Leveraged ETF", track: "SOXX", lev: 3 },
    { t: "BND", n: "Vanguard Total Bond Market ETF", p: 74, y: 3.7, q: 12, cat: "Bond ETF", beta: 0.05, vol: 0.055, rate: 0.9 },
    { t: "AGG", n: "iShares Core U.S. Aggregate Bond ETF", p: 100, y: 3.8, q: 12, cat: "Bond ETF", beta: 0.05, vol: 0.055, rate: 0.9 },
    { t: "TLT", n: "iShares 20+ Year Treasury Bond ETF", p: 89, y: 4.4, q: 12, cat: "Bond ETF", beta: -0.1, vol: 0.15, rate: 2.4 },
    { t: "IEF", n: "iShares 7-10 Year Treasury Bond ETF", p: 96, y: 3.8, q: 12, cat: "Bond ETF", beta: -0.05, vol: 0.07, rate: 1.1 },
    { t: "SHY", n: "iShares 1-3 Year Treasury Bond ETF", p: 83, y: 4, q: 12, cat: "Bond ETF", beta: 0, vol: 0.015, rate: 0.2 },
    { t: "SGOV", n: "iShares 0-3 Month Treasury Bond ETF", p: 100.5, y: 4.3, q: 12, cat: "Bond ETF", beta: 0, vol: 0.003, rate: 0.01 },
    { t: "BIL", n: "SPDR Bloomberg 1-3 Month T-Bill ETF", p: 91.5, y: 4.3, q: 12, cat: "Bond ETF", beta: 0, vol: 0.003, rate: 0.01 },
    { t: "LQD", n: "iShares iBoxx Investment Grade Corporate Bond", p: 111, y: 4.4, q: 12, cat: "Bond ETF", beta: 0.15, vol: 0.08, rate: 1.2 },
    { t: "HYG", n: "iShares iBoxx High Yield Corporate Bond", p: 81, y: 5.8, q: 12, cat: "Bond ETF", beta: 0.3, vol: 0.07, rate: 0.5 },
    { t: "JNK", n: "SPDR Bloomberg High Yield Bond ETF", p: 97, y: 6.3, q: 12, cat: "Bond ETF", beta: 0.3, vol: 0.07, rate: 0.5 },
    { t: "TIP", n: "iShares TIPS Bond ETF", p: 111, y: 3, q: 12, cat: "Bond ETF", beta: 0.02, vol: 0.06, rate: 0.8 },
    { t: "MUB", n: "iShares National Muni Bond ETF", p: 106, y: 3.1, q: 12, cat: "Bond ETF", beta: 0.02, vol: 0.05, rate: 0.8 },
    { t: "EMB", n: "iShares J.P. Morgan USD Emerging Markets Bond", p: 96, y: 5, q: 12, cat: "Bond ETF", beta: 0.3, vol: 0.09, rate: 1, fac: "intl" },
    { t: "VCIT", n: "Vanguard Intermediate-Term Corporate Bond", p: 84, y: 4.4, q: 12, cat: "Bond ETF", beta: 0.1, vol: 0.06, rate: 0.9 },
    { t: "BNDX", n: "Vanguard Total International Bond ETF", p: 49, y: 4.2, q: 12, cat: "Bond ETF", beta: 0.02, vol: 0.045, rate: 0.7, fac: "intl" },
    { t: "PFF", n: "iShares Preferred & Income Securities ETF", p: 31, y: 6.3, q: 12, cat: "Preferred ETF", beta: 0.3, vol: 0.09, rate: 0.6 },
    { t: "PGX", n: "Invesco Preferred ETF", p: 11.5, y: 6, q: 12, cat: "Preferred ETF", beta: 0.3, vol: 0.09, rate: 0.6 },
    { t: "VFIAX", n: "Vanguard 500 Index Fund Admiral", p: 610, y: 1.2, q: 4, cat: "Mutual Fund", beta: 1, vol: 0.16 },
    { t: "FXAIX", n: "Fidelity 500 Index Fund", p: 230, y: 1.2, q: 4, cat: "Mutual Fund", beta: 1, vol: 0.16 },
    { t: "VTSAX", n: "Vanguard Total Stock Market Index Admiral", p: 155, y: 1.2, q: 4, cat: "Mutual Fund", beta: 1.02, vol: 0.165 },
    { t: "VBTLX", n: "Vanguard Total Bond Market Index Admiral", p: 9.8, y: 3.7, q: 12, cat: "Mutual Fund", beta: 0.05, vol: 0.055, rate: 0.9 },
    { t: "FZROX", n: "Fidelity ZERO Total Market Index Fund", p: 22, y: 1.1, q: 1, cat: "Mutual Fund", beta: 1.02, vol: 0.165 },
  ],

  // Preferred shares: fixed-rate, $25 par, trade like low-volatility income securities.
  preferred: `
JPM-PC|JPMorgan Chase 6.00% Pfd Series EE|25.1|6|
BAC-PK|Bank of America 5.875% Pfd Series HH|24|5.9|
BAC-PL|Bank of America 7.25% Conv Pfd Series L|1230|5.9|
WFC-PL|Wells Fargo 7.50% Conv Pfd Series L|1220|6.1|
WFC-PY|Wells Fargo 5.625% Pfd Series Y|21|5.4|
MS-PK|Morgan Stanley 5.85% Pfd Series K|24.5|5.9|
ALL-PH|Allstate 5.10% Pfd Series H|21|5.9|
PSA-PH|Public Storage 5.60% Pfd Series H|23.5|5.6|
T-PA|AT&T 5.000% Pfd Series A|20|6.2|
SCHW-PJ|Charles Schwab 4.45% Pfd Series J|18|6.1|
MET-PE|MetLife 5.625% Pfd Series E|24|5.7|
KEY-PK|KeyCorp 5.65% Pfd Series F|22|5.7|
DUK-PA|Duke Energy 5.75% Pfd Series A|24.8|5.8|
`,

  // American Depositary Receipts and other foreign companies listed in the US (USD).
  international: `
TSM|Taiwan Semiconductor (ADR)|290|1.1|bh
ASML|ASML Holding (ADR)|960|0.7|n
NVO|Novo Nordisk (ADR)|55|3|S
SAP|SAP SE (ADR)|270|1|A
TM|Toyota Motor (ADR)|195|2.5|S
BABA|Alibaba Group (ADR)|175|1.1|Ah
SONY|Sony Group (ADR)|28|0.5|S
SHEL|Shell plc (ADR)|72|4|
BP|BP plc (ADR)|34|5.6|
AZN|AstraZeneca (ADR)|80|2|nS
UL|Unilever (ADR)|60|3.4|
BTI|British American Tobacco (ADR)|55|5.8|
DEO|Diageo (ADR)|100|4|S
BUD|Anheuser-Busch InBev (ADR)|60|1.7|A
RIO|Rio Tinto (ADR)|66|6.5|S
BHP|BHP Group (ADR)|55|4.5|S
VALE|Vale (ADR)|11|6|S
HSBC|HSBC Holdings (ADR)|70|5.4|
MUFG|Mitsubishi UFJ Financial (ADR)|15|2.5|S
SHOP|Shopify|150|0|nh
PDD|PDD Holdings (ADR)|130|0|nh
JD|JD.com (ADR)|34|2.9|nA
NIO|NIO Inc (ADR)|7|0|h
BIDU|Baidu (ADR)|130|0|nh
INFY|Infosys (ADR)|17|2.8|S
HDB|HDFC Bank (ADR)|70|1|A
ARM|Arm Holdings (ADR)|145|0|nh
NU|Nu Holdings|16|0|h
MELI|MercadoLibre|2300|0|nh
SE|Sea Ltd (ADR)|180|0|h
RY|Royal Bank of Canada|145|3|
TD|Toronto-Dominion Bank|80|3.8|
ENB|Enbridge|48|5.8|
CNQ|Canadian Natural Resources|32|5|
NVS|Novartis (ADR)|125|3.6|A
SNY|Sanofi (ADR)|48|4.3|nA
GSK|GSK plc (ADR)|42|4|
TTE|TotalEnergies (ADR)|62|5.5|
ING|ING Groep (ADR)|25|5.5|S
UBS|UBS Group|40|1.2|A
DB|Deutsche Bank|36|1.5|A
SAN|Banco Santander (ADR)|10|2.5|S
BBVA|BBVA (ADR)|19|4.5|S
NTES|NetEase (ADR)|150|1.8|n
TCEHY|Tencent Holdings (ADR, OTC)|75|0.9|A
NSRGY|Nestle (ADR, OTC)|95|3.3|A
LVMUY|LVMH (ADR, OTC)|120|2|S
LYG|Lloyds Banking Group (ADR)|4|4.5|S
BCS|Barclays (ADR)|18|2.6|S
NGG|National Grid (ADR)|70|4.5|S
RELX|RELX (ADR)|50|1.8|S
E|Eni (ADR)|32|6|S
EQNR|Equinor (ADR)|25|5.5|
WDS|Woodside Energy (ADR)|17|6.5|S
PBR|Petrobras (ADR)|14|12|S
ITUB|Itau Unibanco (ADR)|6.5|4|M
BBD|Banco Bradesco (ADR)|2.6|5|M
AMX|America Movil (ADR)|18|2.5|S
BNS|Bank of Nova Scotia|55|5.8|
SU|Suncor Energy|40|4.2|
RHHBY|Roche Holding (ADR, OTC)|40|3.3|A
ABB|ABB (ADR)|55|1.8|A
PHG|Philips (ADR)|25|2|A
SMFG|Sumitomo Mitsui Financial (ADR)|15|3.5|S
HMC|Honda Motor (ADR)|30|4|S
WIT|Wipro (ADR)|3|0.5|A
IBN|ICICI Bank (ADR)|30|0.7|A
LI|Li Auto (ADR)|25|0|Ah
XPEV|XPeng (ADR)|20|0|Ah`,

  // London Stock Exchange (priced in GBP, pounds). UK purchases pay 0.5% stamp duty.
  uk: `
AZN.L|AstraZeneca|120|2|S
SHEL.L|Shell|27|4|
HSBA.L|HSBC Holdings|10.5|5.2|
ULVR.L|Unilever|44|3.3|
REL.L|RELX|34|1.8|S
BP.L|BP|4.3|5.7|
GSK.L|GSK|14.5|4.2|
RIO.L|Rio Tinto|48|6.5|S
BATS.L|British American Tobacco|42|5.6|
LSEG.L|London Stock Exchange Group|90|1.5|S
DGE.L|Diageo|18|4.5|S
NG.L|National Grid|10.6|4.4|S
RR.L|Rolls-Royce Holdings|11.5|0.8|Sh
GLEN.L|Glencore|3.3|3|Sh
LLOY.L|Lloyds Banking Group|0.82|4|S
BARC.L|Barclays|3.7|2.3|S
VOD.L|Vodafone Group|0.86|4.5|S
NWG.L|NatWest Group|5.3|4.3|S
TSCO.L|Tesco|4.3|3.1|S
BA.L|BAE Systems|19.5|1.7|S
LGEN.L|Legal & General|2.35|9|S
AV.L|Aviva|6.5|6.4|S
IMB.L|Imperial Brands|30|5.3|
PRU.L|Prudential plc|9.5|2|S
AAL.L|Anglo American|26|1.5|Sh
CPG.L|Compass Group|25|1.8|S
EXPN.L|Experian|37|1.4|S
SSE.L|SSE plc|18|3.5|S
BT-A.L|BT Group|1.95|4.1|S
LAND.L|Land Securities (REIT)|5.8|7|
SGRO.L|Segro (REIT)|6.7|4.4|S
TW.L|Taylor Wimpey|1|9.3|S
PSN.L|Persimmon|12|5|S
MNG.L|M&G|2.6|8|S
PHNX.L|Phoenix Group|6.6|8|S
SBRY.L|J Sainsbury|3.1|4.4|S
MKS.L|Marks & Spencer|3.6|1|S
NXT.L|Next plc|130|1.8|S
JD.L|JD Sports Fashion|0.9|1.1|S
ABF.L|Associated British Foods|21|3|S
III.L|3i Group|42|1.6|S
IAG.L|International Airlines Group|3.8|1.4|Sh
EZJ.L|easyJet|4.7|2.6|Ah
WPP.L|WPP|3.5|11|S
CNA.L|Centrica|1.65|2.7|S
SVT.L|Severn Trent|26|4.7|S
UU.L|United Utilities|11|4.9|S
RKT.L|Reckitt Benckiser|56|3.6|S
HLN.L|Haleon|3.5|1.8|S
ITV.L|ITV plc|0.8|6|S
SMT.L|Scottish Mortgage Investment Trust|11|0.4|S
CTY.L|City of London Investment Trust|4.9|4.4|
ISF.L|iShares Core FTSE 100 ETF|8.9|3.5|
VUSA.L|Vanguard S&P 500 UCITS ETF|98|1|
VWRL.L|Vanguard FTSE All-World UCITS ETF|130|1.5|
VUKE.L|Vanguard FTSE 100 UCITS ETF|40|3.6|
STAN.L|Standard Chartered|12.5|2|S
ANTO.L|Antofagasta|22|1.5|S
SGE.L|Sage Group|12|1.8|S
WTB.L|Whitbread|29|2.5|S
SN.L|Smith & Nephew|11|2.5|
SMIN.L|Smiths Group|22|1.9|S
HLMA.L|Halma|30|0.9|S
CRDA.L|Croda International|30|3.5|S
BNZL.L|Bunzl|24|2.5|S
SPX.L|Spirax Group|65|2.3|S
BDEV.L|Barratt Redrow|4|5|S
BKG.L|Berkeley Group|38|2.5|S
HWDN.L|Howden Joinery|8|2.5|S
BLND.L|British Land (REIT)|3.8|6|
ADM.L|Admiral Group|32|4.5|S
HSX.L|Hiscox|12|2.5|S
BEZ.L|Beazley|8.5|2|S
SDR.L|Schroders|3.5|6|S
OCDO.L|Ocado Group|3|0|A
AUTO.L|Auto Trader Group|7.5|1.3|S
RMV.L|Rightmove|7|1.4|S
ITRK.L|Intertek Group|48|2.8|S
DCC.L|DCC|50|4|S
KGF.L|Kingfisher|2.8|4.5|S
WISE.L|Wise|10|0|A
FRES.L|Fresnillo|12|1.5|S
MNDI.L|Mondi|11|4.5|S
PSON.L|Pearson|11|2.4|S
IHG.L|InterContinental Hotels Group|85|1.5|S
RTO.L|Rentokil Initial|3.5|2.5|S
WEIR.L|Weir Group|24|1.6|S
MRO.L|Melrose Industries|5|0.5|S
CCH.L|Coca-Cola HBC|38|2.5|A
ENT.L|Entain|7|2|S
HIK.L|Hikma Pharmaceuticals|19|2|S
BAB.L|Babcock International|8|1|S
QQ.L|QinetiQ|4.5|2.2|S
TATE.L|Tate & Lyle|5.5|4|S
GAW.L|Games Workshop|140|4|S

IUKD.L|iShares UK Dividend UCITS ETF|10.5|5.5|
VMID.L|Vanguard FTSE 250 UCITS ETF|33|3.2|
VHYL.L|Vanguard FTSE All-World High Dividend Yield UCITS ETF|62|3.1|
VEVE.L|Vanguard FTSE Developed World UCITS ETF|76|1.6|
VFEM.L|Vanguard FTSE Emerging Markets UCITS ETF|55|2.7|
SWDA.L|iShares Core MSCI World UCITS ETF|95|1.3|S
IWDG.L|iShares Core MSCI World GBP Hedged UCITS ETF|8|1.5|S
HMWO.L|HSBC MSCI World UCITS ETF|32|1.5|S
EQQQ.L|Invesco EQQQ Nasdaq-100 UCITS ETF|450|0.4|S
IUSA.L|iShares Core S&P 500 UCITS ETF|45|1.2|
IGLT.L|iShares Core UK Gilts UCITS ETF|10.3|4.1|S
IGLS.L|iShares UK Gilts 0-5yr UCITS ETF|5.1|3.9|S
INXG.L|iShares Index-Linked Gilts UCITS ETF|12|1.5|S
SGLN.L|iShares Physical Gold ETC|45|0|A
VAGP.L|Vanguard Global Aggregate Bond GBP Hedged UCITS ETF|22|3.5|

FCIT.L|F&C Investment Trust|11.5|1.3|
ATST.L|Alliance Witan Investment Trust|13|2|
JGGI.L|JPMorgan Global Growth & Income Investment Trust|5.7|3.6|
MYI.L|Murray International Investment Trust|2.7|4.3|
HFEL.L|Henderson Far East Income Investment Trust|2.3|11|
BRWM.L|BlackRock World Mining Investment Trust|5.9|6|
PNL.L|Personal Assets Investment Trust|5|1.2|
RCP.L|RIT Capital Partners Investment Trust|19|2|
TMPL.L|Temple Bar Investment Trust|3|3.8|
EDIN.L|Edinburgh Investment Trust|7.8|3.6|
MRCH.L|Merchants Investment Trust|6.1|4.9|
`,

  // Small-cap and penny stocks: cheap, thin, and very volatile.
  penny: `
SNDL|SNDL Inc|2.1|0|n
PLUG|Plug Power|2|0|n
TLRY|Tilray Brands|1.1|0|n
BB|BlackBerry|4|0|
CLOV|Clover Health|3|0|n
AMC|AMC Entertainment|3|0|
FUBO|fuboTV|3.5|0|
IQ|iQIYI (ADR)|2.5|0|n
ACB|Aurora Cannabis|5|0|n
GRAB|Grab Holdings|5.5|0|n
OPEN|Opendoor Technologies|6|0|n
SPCE|Virgin Galactic|3.5|0|
BBAI|BigBear.ai|6|0|
NOK|Nokia (ADR)|6|2.4|
LUMN|Lumen Technologies|6|0|
WOOF|Petco|3.2|0|n
BYND|Beyond Meat|2|0|n
`,
};

/*
 * Shape of the real year behind the reference prices above (roughly autumn 2024 to autumn 2025),
 * used for the back history before day 1. Each point is [months before the start, price then].
 * These are approximate levels from public price history, not exact closes: enough to put the
 * real highs, lows and trends (such as the April 2025 sell-off and rebound) in the right places.
 */
window.MARKET_DATA.history = {
  // S&P 500 index level
  market: [[12, 5750], [10, 6050], [8, 6100], [7, 5600], [6, 4980], [5, 5800], [4, 6100], [2, 6450], [0, 6700]],
  stocks: {
    AAPL: [[12, 226], [10, 250], [8, 245], [6, 172], [4, 200], [2, 230]],
    MSFT: [[12, 420], [10, 440], [8, 410], [6, 355], [4, 480], [2, 520]],
    NVDA: [[12, 125], [10, 135], [8, 135], [6, 97], [4, 155], [2, 180]],
    AMZN: [[12, 185], [10, 225], [8, 225], [6, 172], [4, 215], [2, 230]],
    GOOGL: [[12, 165], [10, 190], [8, 185], [6, 147], [4, 175], [2, 200]],
    GOOG: [[12, 166], [10, 191], [8, 186], [6, 148], [4, 176], [2, 201]],
    META: [[12, 580], [10, 620], [8, 700], [6, 510], [4, 700], [2, 780]],
    TSLA: [[12, 250], [10, 420], [8, 350], [6, 225], [4, 320], [2, 330]],
    AVGO: [[12, 175], [10, 240], [8, 220], [6, 155], [4, 260], [2, 300]],
    ORCL: [[12, 170], [10, 180], [8, 170], [6, 120], [4, 210], [2, 240]],
    JPM: [[12, 210], [10, 245], [8, 270], [6, 215], [4, 280], [2, 295]],
    V: [[12, 290], [10, 315], [8, 350], [6, 320], [4, 355], [2, 345]],
    NFLX: [[12, 720], [10, 900], [8, 1000], [6, 870], [4, 1300], [2, 1200]],
    PLTR: [[12, 40], [10, 75], [8, 110], [6, 78], [4, 135], [2, 180]],
    AMD: [[12, 160], [10, 125], [8, 110], [6, 80], [4, 140], [2, 175]],
    INTC: [[12, 22], [10, 20], [8, 24], [6, 18], [4, 22], [2, 24]],
    LLY: [[12, 900], [10, 800], [8, 880], [6, 750], [4, 770], [2, 700]],
    UNH: [[12, 580], [10, 600], [8, 520], [6, 420], [4, 300], [2, 300]],
    WMT: [[12, 80], [10, 92], [8, 95], [6, 85], [4, 97], [2, 100]],
    COST: [[12, 880], [10, 950], [8, 1050], [6, 980], [4, 1000], [2, 950]],
    KO: [[12, 70], [10, 63], [8, 68], [6, 71], [4, 71], [2, 69]],
    XOM: [[12, 118], [10, 108], [8, 110], [6, 105], [4, 108], [2, 110]],
    QQQ: [[12, 490], [10, 525], [8, 530], [6, 425], [4, 530], [2, 570]],
    GLD: [[12, 245], [10, 240], [8, 265], [6, 275], [4, 310], [2, 310]],
    IBIT: [[12, 35], [10, 55], [8, 55], [6, 44], [4, 60], [2, 65]],
  },
};
