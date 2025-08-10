'use client'

import { useState, useEffect } from 'react'
import { Layout, MainContent, Footer } from '@/components/layout/layout'
import { Header } from '@/components/layout/header'
import { Hero } from '@/components/layout/hero'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Clock, ExternalLink, LogIn, Download, X, Play, Pause, Globe, RefreshCw, Settings2, Search, ChevronLeft, ChevronRight, Maximize2, Minimize2, Bot, Eye } from 'lucide-react'
import { useAuthActions } from "@convex-dev/auth/react"
import { useConvexAuth, useMutation, useQuery, useAction } from "convex/react"
import { api } from "../../convex/_generated/api"
import { useRouter } from 'next/navigation'
import { WebhookConfigModal } from '@/components/WebhookConfigModal'
import { APP_CONFIG } from '@/config/app.config'
import { validateEmail, validatePassword } from '@/lib/validation'
import { useToast } from '@/hooks/use-toast'
import { LoadingOverlay } from '@/components/ui/loading-overlay'

// Helper function to format interval display
function formatInterval(minutes: number | undefined): string {
  if (!minutes || minutes === 0) return 'Not set';
  if (minutes < 1) return `${Math.round(minutes * 60)} seconds`;
  if (minutes === 1) return '1 minute';
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return '1 hour';
  if (minutes < 1440) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${Math.floor(hours)} hours`;
  }
  const days = minutes / 1440;
  return days === 1 ? '1 day' : `${Math.floor(days)} days`;
}

// Helper function to get favicon URL
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

export default function HomePage() {
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth()
  const { signIn } = useAuthActions()
  const { addToast } = useToast()
  const router = useRouter()
  
  // Debug auth state changes
  useEffect(() => {
    console.log('Auth state:', { isAuthenticated, authLoading })
  }, [isAuthenticated, authLoading])
  
  // Auth state
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [helperText, setHelperText] = useState('')
  
  // Website monitoring state
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  
  // Convex queries and mutations
  const websites = useQuery(api.websites.getUserWebsites)
  
  // Track website list updates
  useEffect(() => {
    if (websites && websites.length > 0) {
      console.log(`Monitoring ${websites.length} website${websites.length !== 1 ? 's' : ''}`)
    }
  }, [websites])
  const createWebsite = useMutation(api.websites.createWebsite)
  const deleteWebsite = useMutation(api.websites.deleteWebsite)
  const pauseWebsite = useMutation(api.websites.pauseWebsite)
  const updateWebsite = useMutation(api.websites.updateWebsite)
  const triggerScrape = useAction(api.firecrawl.triggerScrape)

  // Track scrape results
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null)
  const [viewingSpecificScrape, setViewingSpecificScrape] = useState<string | null>(null)
  const [checkLogFilter, setCheckLogFilter] = useState<'all' | 'changed' | 'meaningful'>('all')
  const [processingWebsites, setProcessingWebsites] = useState<Set<string>>(new Set())
  const [deletingWebsites, setDeletingWebsites] = useState<Set<string>>(new Set())
  const [newlyCreatedWebsites, setNewlyCreatedWebsites] = useState<Set<string>>(new Set())
  const [showAddedLines, setShowAddedLines] = useState(true)
  const [showRemovedLines, setShowRemovedLines] = useState(true)
  const [onlyShowDiff, setOnlyShowDiff] = useState(true)
  
  // Pagination states
  const [websitesPage, setWebsitesPage] = useState(1)
  const [changesPage, setChangesPage] = useState(1)
  const ITEMS_PER_PAGE_WEBSITES = 5
  const ITEMS_PER_PAGE_CHANGES = 10
  
  // Expanded panel state
  const [expandedPanel, setExpandedPanel] = useState<'websites' | 'changes' | null>(null)
  
  // Webhook configuration modal state
  const [showWebhookModal, setShowWebhookModal] = useState(false)
  const [editingWebsiteId, setEditingWebsiteId] = useState<string | null>(null)
  const [pendingWebsite, setPendingWebsite] = useState<{
    url: string
    name: string
  } | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [changesSearchQuery, setChangesSearchQuery] = useState('')
  
  
  // Get latest scrape for each website
  const latestScrapes = useQuery(api.websites.getLatestScrapeForWebsites)
  
  // Get all scrape results for check log
  const allScrapeHistory = useQuery(api.websites.getAllScrapeHistory)

  // Handle escape key for modals
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewingSpecificScrape) {
          setViewingSpecificScrape(null)
        }
        if (showWebhookModal) {
          setShowWebhookModal(false)
          setEditingWebsiteId(null)
          setPendingWebsite(null)
        }
      }
    }
    
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [viewingSpecificScrape, showWebhookModal])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsAuthenticating(true)

    // Trim email before validation and use
    const trimmedEmail = email.trim()
    
    // Validate email format first
    const emailValidation = validateEmail(trimmedEmail)
    if (!emailValidation.isValid) {
      addToast({
        variant: 'error',
        title: 'Invalid Email',
        description: emailValidation.error || 'Please enter a valid email address',
        duration: 4000
      })
      setIsAuthenticating(false)
      return
    }

    // Validate password
    const passwordValidation = validatePassword(password, authMode)
    if (!passwordValidation.isValid) {
      addToast({
        variant: 'error',
        title: 'Invalid Password',
        description: passwordValidation.error || 'Please check your password requirements',
        duration: 4000
      })
      setIsAuthenticating(false)
      return
    }

    try {
      await signIn("password", {
        email: trimmedEmail,
        password,
        flow: authMode,
      })
      // Clear form on successful auth
      setEmail('')
      setPassword('')
      setHelperText('')
      // Show success message
      addToast({
        variant: 'success',
        title: authMode === 'signIn' ? 'Welcome Back!' : 'Account Created!',
        description: authMode === 'signIn' 
          ? 'You have successfully signed in.' 
          : 'Your account has been created successfully.',
        duration: 3000
      })
      
      // Force a router refresh to ensure auth state is updated
      setTimeout(() => {
        router.refresh()
      }, 100)
    } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      // Check for InvalidAccountId in various ways
      const errorMessage = error.message || error.toString() || '';
      const errorLower = errorMessage.toLowerCase();
      
      // More comprehensive invalid account detection
      const isInvalidAccount = errorLower.includes('invalidaccountid') || 
                              errorLower.includes('invalid account') ||
                              errorLower.includes('no account') ||
                              errorLower.includes('account not found') ||
                              errorLower.includes('user not found') ||
                              errorLower.includes('does not exist');
      
      // Check for existing account errors
      const isExistingAccount = errorLower.includes('already exists') || 
                               errorLower.includes('already registered') ||
                               errorLower.includes('account exists') ||
                               errorLower.includes('email already');
      
      // Check for password errors
      const isPasswordError = errorLower.includes('password') || 
                             errorLower.includes('credentials') ||
                             errorLower.includes('authentication failed');
      
      if (isInvalidAccount && authMode === 'signIn') {
        // Auto-switch to signup mode for unregistered users
        setAuthMode('signUp')
        setPassword('') // Clear password for security
        setHelperText('No account found. Enter a password to create one.')
        setIsAuthenticating(false)
        return
      } else if (isExistingAccount && authMode === 'signUp') {
        setAuthMode('signIn')
        setHelperText('Account already exists. Enter your password to sign in.')
        setIsAuthenticating(false)
        return
      } else if (isPasswordError) {
        if (authMode === 'signIn') {
          addToast({
            variant: 'error',
            title: 'Authentication Failed',
            description: 'The password you entered is incorrect. Please try again.',
            duration: 4000
          })
        } else {
          addToast({
            variant: 'error',
            title: 'Account Creation Failed',
            description: 'Unable to create your account. Please check your password and try again.',
            duration: 4000
          })
        }
      } else if (errorLower.includes('network') || errorLower.includes('connection')) {
        addToast({
          variant: 'error',
          title: 'Connection Error',
          description: 'Please check your internet connection and try again.',
          duration: 5000
        })
      } else if (errorLower.includes('rate limit') || errorLower.includes('too many')) {
        addToast({
          variant: 'warning',
          title: 'Too Many Attempts',
          description: 'Please wait a few minutes before trying again.',
          duration: 6000
        })
      } else {
        // Generic fallback with more helpful message
        addToast({
          variant: 'error',
          title: authMode === 'signIn' ? 'Sign In Failed' : 'Sign Up Failed',
          description: authMode === 'signIn' 
            ? 'Please check your email and password.' 
            : 'Please try again or contact support.',
          duration: 4000
        })
      }
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleAddWebsite = () => {
    if (!url) {
      setError('Please enter a URL')
      return
    }

    // Add https:// if no protocol is specified
    let processedUrl = url.trim()
    if (!processedUrl.match(/^https?:\/\//)) {
      processedUrl = 'https://' + processedUrl
    }

    // Basic URL validation and auto-generate name
    let autoGeneratedName = ''
    try {
      const urlObj = new URL(processedUrl)
      // Generate a friendly name from the hostname
      autoGeneratedName = urlObj.hostname
        .replace('www.', '')
        .split('.')[0]
        .charAt(0).toUpperCase() + urlObj.hostname.replace('www.', '').split('.')[0].slice(1)
    } catch {
      setError('Please enter a valid URL')
      return
    }

    setError('')
    
    // Store the pending website data and show the modal
    setPendingWebsite({
      url: processedUrl,
      name: autoGeneratedName
    })
    setShowWebhookModal(true)
    setUrl('')
  }

  const formatTimeAgo = (timestamp: number | undefined) => {
    if (!timestamp) return 'Never'
    
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`
    return `${Math.floor(seconds / 86400)} days ago`
  }

  const downloadMarkdown = (markdown: string | undefined, websiteName: string, timestamp: number) => {
    if (!markdown) {
      console.error('No markdown content available to download')
      return
    }
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${websiteName.replace(/[^a-z0-9]/gi, '_')}_${new Date(timestamp).toISOString().split('T')[0]}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleCheckNow = async (websiteId: string) => {
    setProcessingWebsites(prev => new Set([...prev, websiteId]))
    
    try {
      await triggerScrape({ websiteId: websiteId as any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      // The UI will automatically update via Convex reactive queries
      
      // Keep processing indicator for a bit to show the scrape is running
      setTimeout(() => {
        setProcessingWebsites(prev => {
          const newSet = new Set(prev)
          newSet.delete(websiteId)
          return newSet
        })
      }, 5000) // Increased to 5 seconds
    } catch (error) {
      console.error('Failed to trigger scrape:', error)
      setProcessingWebsites(prev => {
        const newSet = new Set(prev)
        newSet.delete(websiteId)
        return newSet
      })
    }
  }

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </Layout>
    )
  }

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-6xl mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left side - Hero content */}
              <div className="text-center lg:text-left">
                <h1 className="text-[3rem] lg:text-[4rem] font-semibold tracking-tight leading-none mb-6">
                  <span className="bg-gradient-to-tr from-red-600 to-yellow-500 bg-clip-text text-transparent block">
                    Firecrawl
                  </span>
                  <span className="text-black block">
                    Observer
                  </span>
                </h1>
                <p className="text-xl text-zinc-600 dark:text-zinc-400">
                  Monitor websites with Firecrawl change tracking
                </p>
              </div>
              
              {/* Right side - Sign in form */}
              <div className="w-full max-w-md mx-auto lg:mx-0">
                <div className="bg-white rounded-lg p-8 shadow-sm relative">
                  <LoadingOverlay 
                    visible={isAuthenticating} 
                    message={authMode === 'signIn' ? 'Signing you in...' : 'Creating your account...'}
                  />
                  <div className="flex items-center justify-center mb-6">
                    <h2 className="text-2xl font-semibold">
                      {authMode === 'signIn' ? 'Welcome Back' : 'Get Started'}
                    </h2>
                  </div>
                  <p className="text-center text-zinc-600 mb-6">
                    {authMode === 'signIn' 
                      ? 'Sign in to your account to continue monitoring websites' 
                      : 'Create an account to start monitoring website changes'}
                  </p>
                  
                  <form onSubmit={handleAuth} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="email" className="text-sm font-medium text-zinc-700">
                        Email
                      </label>
                      <Input 
                        id="email"
                        type="email" 
                        placeholder={APP_CONFIG.email.placeholderEmail} 
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value)
                          if (helperText) setHelperText('')
                        }}
                        required
                        autoComplete="email"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="password" className="text-sm font-medium text-zinc-700">
                        Password
                      </label>
                      <Input 
                        id="password"
                        type="password" 
                        placeholder={authMode === 'signUp' ? 'Minimum 6 characters' : '••••••••'} 
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          if (helperText) setHelperText('')
                        }}
                        required
                        autoComplete={authMode === 'signIn' ? 'current-password' : 'new-password'}
                      />
                      {helperText && (
                        <p className="text-sm text-gray-600 mt-1">
                          {helperText}
                        </p>
                      )}
                    </div>
                    
                    <Button 
                      type="submit" 
                      variant="orange" 
                      className="w-full"
                      disabled={isAuthenticating}
                    >
                      {isAuthenticating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {authMode === 'signIn' ? 'Signing in...' : 'Creating account...'}
                        </>
                      ) : (
                        <>
                          <LogIn className="mr-2 h-4 w-4" />
                          {authMode === 'signIn' ? 'Sign In' : 'Sign Up'}
                        </>
                      )}
                    </Button>
                  </form>
                  
                  <p className="text-center text-sm text-zinc-600 mt-4">
                    {authMode === 'signIn' ? (
                      <>
                        Don&apos;t have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('signUp')
                            setHelperText('')
                          }}
                          className="text-orange-600 hover:text-orange-700 font-medium"
                        >
                          Sign up
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode('signIn')
                            setHelperText('')
                          }}
                          className="text-orange-600 hover:text-orange-700 font-medium"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <Footer />
      </Layout>
    )
  }
  
  // Main authenticated view (when isAuthenticated = true)
  return (
    <Layout>
      <Header ctaHref="https://github.com/new?template_name=firecrawl-observer&template_owner=your-org" />
      
      
      <Hero 
        title={
          <div className="flex flex-col leading-none">
            <span className="bg-gradient-to-tr from-red-600 to-yellow-500 bg-clip-text text-transparent">
              Firecrawl
            </span>
            <span className="text-black">
              Observer
            </span>
          </div>
        }
        subtitle="Monitor websites with Firecrawl change tracking"
      />
      
      <MainContent maxWidth="7xl" className="py-12">
        <div className="space-y-6">
          {/* Add Website Form - Full Width */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Add New Website</h3>
            </div>
                    
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      handleAddWebsite();
                    }} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Input 
                          type="text" 
                          placeholder="https://example.com" 
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          disabled={isAdding}
                          className="flex-1"
                        />
                        <Button 
                          type="submit"
                          variant="orange"
                          size="sm"
                          disabled={isAdding || !url.trim()}
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Start Observing'
                          )}
                        </Button>
                      </div>
                    </form>
                    {error && (
                      <p className="text-sm text-orange-500 mt-2">{error}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">
                      Configure monitor type, check intervals, and notifications after adding
                    </p>
          </div>
          
          {/* Two Column Layout */}
          <div className="flex flex-col lg:grid lg:grid-cols-2 gap-6">
            {/* Left Column - Websites */}
            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm flex flex-col">
                {/* Search Header */}
                <div className="p-6 border-b flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold">Currently Tracked Websites</h3>
                    <div className="flex items-center gap-3">
                      {websites ? (
                        <>
                          <span className="text-sm text-gray-500">{websites.length} site{websites.length !== 1 ? 's' : ''}</span>
                          {websites.length > 0 && (
                            <Button
                              variant="orange"
                              size="sm"
                              onClick={async () => {
                                const activeWebsites = websites.filter(w => w.isActive && !w.isPaused);
                                for (const website of activeWebsites) {
                                  await handleCheckNow(website._id);
                                }
                              }}
                              className="gap-2"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Check All
                            </Button>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-gray-400">Loading...</span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedPanel(expandedPanel === 'websites' ? null : 'websites')}
                        className="w-8 h-8 p-0 bg-black text-white border-black rounded-[10px] [box-shadow:inset_0px_-2px_0px_0px_#18181b,_0px_1px_6px_0px_rgba(24,_24,_27,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#18181b,_0px_1px_3px_0px_rgba(24,_24,_27,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#18181b,_0px_1px_2px_0px_rgba(24,_24,_27,_30%)] transition-all duration-200"
                        title={expandedPanel === 'websites' ? "Minimize" : "Expand"}
                      >
                        {expandedPanel === 'websites' ? (
                          <Minimize2 className="h-4 w-4 text-white" />
                        ) : (
                          <Maximize2 className="h-4 w-4 text-white" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        type="text"
                        placeholder="Search by name or URL..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        disabled={!websites}
                      />
                    </div>
                  </div>
                </div>
                    
                    {/* Website List */}
                    <div className="divide-y divide-gray-100">
                      {(() => {
                        // Show loading state while websites is undefined
                        if (!websites) {
                          return (
                            <div className="p-8 text-center">
                              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-4" />
                              <p className="text-gray-500">Loading websites...</p>
                            </div>
                          )
                        }

                        const filteredWebsites = websites
                          .filter(website => {
                            const query = searchQuery.toLowerCase()
                            return website.name.toLowerCase().includes(query) || 
                                   website.url.toLowerCase().includes(query)
                          })
                          .sort((a, b) => b._creationTime - a._creationTime)
                        
                        // Pagination calculations
                        const totalPages = Math.ceil(filteredWebsites.length / ITEMS_PER_PAGE_WEBSITES)
                        const startIndex = (websitesPage - 1) * ITEMS_PER_PAGE_WEBSITES
                        const endIndex = startIndex + ITEMS_PER_PAGE_WEBSITES
                        const paginatedWebsites = filteredWebsites.slice(startIndex, endIndex)
                        
                        // Reset to page 1 if current page is out of bounds
                        if (websitesPage > totalPages && totalPages > 0) {
                          setWebsitesPage(1)
                        }
                        
                        if (filteredWebsites.length === 0 && searchQuery) {
                          return (
                            <div className="text-center py-8 text-gray-500">
                              <Search className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                              <p className="text-lg font-medium">No websites found</p>
                              <p className="text-sm mt-1">Try searching with different keywords</p>
                            </div>
                          )
                        }
                        
                        if (websites.length === 0) {
                          return (
                            <div className="text-center py-8 text-gray-500">
                              <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                              <p className="text-lg font-medium">No websites yet</p>
                              <p className="text-sm mt-1">Add your first website above to start monitoring</p>
                            </div>
                          )
                        }

                        return (
                          <>
                            {paginatedWebsites.map((website) => {
                  const latestScrape = latestScrapes?.[website._id];
                  const isProcessing = processingWebsites.has(website._id);
                  const isDeleting = deletingWebsites.has(website._id);
                  const hasChanged = latestScrape?.changeStatus === 'changed';
                  
                  return (
                    <div 
                      key={website._id}
                      className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                        isProcessing 
                          ? 'bg-orange-50' 
                          : isDeleting
                          ? 'bg-red-50 opacity-50'
                          : selectedWebsiteId === website._id
                          ? 'bg-orange-50 border-l-4 border-orange-500'
                          : ''
                      }`}
                      onClick={() => {
                        setSelectedWebsiteId(website._id)
                        setChangesPage(1) // Reset changes page when selecting a website
                      }}
                    >
                      <div className="flex items-center gap-4">
                        {/* Website favicon */}
                        <div className="flex-shrink-0">
                          {getFaviconUrl(website.url) ? (
                            <img 
                              src={getFaviconUrl(website.url)} 
                              alt={website.name}
                              className="w-12 h-12 object-contain rounded-lg bg-gray-50 p-2"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.parentElement!.innerHTML = '<div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center"><svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg></div>';
                              }}
                            />
                          ) : (
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                              <Globe className="w-6 h-6 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-base font-medium text-gray-900">{website.name}</h4>
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                                  website.monitorType === 'full_site' 
                                    ? 'bg-orange-100 text-orange-700' 
                                    : 'bg-gray-100 text-gray-700'
                                }`}>
                                  {website.monitorType === 'full_site' ? 'Full Site' : 'Single Page'}
                                </span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  website.isPaused 
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : website.isActive 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {website.isPaused ? 'Paused' : website.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                              <a 
                                href={website.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                              >
                                {website.url}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            
                            {/* Action buttons */}
                            <div className="flex items-center gap-1">
                                <Button 
                                  variant="default" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    pauseWebsite({ 
                                      websiteId: website._id, 
                                      isPaused: !website.isPaused 
                                    })
                                  }}
                                  title={website.isPaused ? "Resume monitoring" : "Pause monitoring"}
                                  className="w-8 h-8 p-0"
                                >
                                  {website.isPaused ? (
                                    <Play className="h-4 w-4" />
                                  ) : (
                                    <Pause className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button 
                                  variant="default" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingWebsiteId(website._id)
                                    setShowWebhookModal(true)
                                  }}
                                  title="Settings"
                                  className="w-8 h-8 p-0"
                                >
                                  <Settings2 className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="default" 
                                  size="sm"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirm(`Are you sure you want to delete "${website.name}"? This action cannot be undone.`)) {
                                      setDeletingWebsites(prev => new Set([...prev, website._id]))
                                      try {
                                        console.log('Deleting website:', website._id, website.name)
                                        await deleteWebsite({ websiteId: website._id })
                                        console.log('Website deleted successfully:', website._id)
                                      } catch (error) {
                                        console.error('Failed to delete website:', error)
                                        alert('Failed to delete website. Please try again.')
                                      } finally {
                                        setDeletingWebsites(prev => {
                                          const newSet = new Set(prev)
                                          newSet.delete(website._id)
                                          return newSet
                                        })
                                      }
                                    }
                                  }}
                                  title="Remove"
                                  className="w-8 h-8 p-0"
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                </Button>
                            </div>
                          </div>
                          
                          {/* Bottom row with status */}
                          {isProcessing ? (
                            <div className="mt-2 flex items-center gap-2 text-orange-600">
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span className="text-xs">
                                {newlyCreatedWebsites.has(website._id) 
                                  ? 'Setting up monitoring...' 
                                  : 'Checking for changes...'
                                }
                              </span>
                            </div>
                          ) : (
                            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                              <div className="flex items-center gap-3">
                                {latestScrape && latestScrape.changeStatus !== 'new' && (
                                  <div className="flex items-center gap-1">
                                    {hasChanged ? (
                                      <>
                                        <div className="w-2 h-2 bg-orange-500 rounded-full" />
                                        <span>Changes detected</span>
                                      </>
                                    ) : (
                                      <>
                                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                                        <span>No changes</span>
                                      </>
                                    )}
                                  </div>
                                )}
                                <span>Checked {formatTimeAgo(website.lastChecked)}</span>
                                <span>Every {formatInterval(website.checkInterval)}</span>
                              </div>
                              <Button 
                                variant="orange"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCheckNow(website._id)
                                }}
                                disabled={isProcessing}
                                className="text-xs"
                              >
                                {isProcessing ? (
                                  <>
                                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                    {newlyCreatedWebsites.has(website._id) ? 'Setting up' : 'Checking'}
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw className="mr-1 h-3 w-3" />
                                    Check Now
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                        })}
                            
                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                              <div className="sticky bottom-0 bg-white border-t p-3">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-600">
                                    Page {websitesPage} of {totalPages}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="orange"
                                      size="sm"
                                      onClick={() => setWebsitesPage(websitesPage - 1)}
                                      disabled={websitesPage === 1}
                                    >
                                      <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="orange"
                                      size="sm"
                                      onClick={() => setWebsitesPage(websitesPage + 1)}
                                      disabled={websitesPage === totalPages}
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </div>
            </div>

            {/* Right Column - Changes */}
          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-sm flex flex-col">
              <div className="p-6 border-b flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-semibold">Change Tracking Log</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={checkLogFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCheckLogFilter('all')}
                    >
                      All
                    </Button>
                    <Button
                      variant={checkLogFilter === 'changed' ? 'orange' : 'outline'}
                      size="sm"
                      onClick={() => setCheckLogFilter('changed')}
                    >
                      Changed Only
                    </Button>
                    <Button
                      variant={checkLogFilter === 'meaningful' ? 'orange' : 'outline'}
                      size="sm"
                      onClick={() => setCheckLogFilter('meaningful')}
                      className="flex items-center gap-1"
                    >
                      <Bot className="h-3 w-3" />
                      Meaningful
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedPanel(expandedPanel === 'changes' ? null : 'changes')}
                      className="w-8 h-8 p-0 bg-black text-white border-black rounded-[10px] [box-shadow:inset_0px_-2px_0px_0px_#18181b,_0px_1px_6px_0px_rgba(24,_24,_27,_58%)] hover:translate-y-[1px] hover:scale-[0.98] hover:[box-shadow:inset_0px_-1px_0px_0px_#18181b,_0px_1px_3px_0px_rgba(24,_24,_27,_40%)] active:translate-y-[2px] active:scale-[0.97] active:[box-shadow:inset_0px_1px_1px_0px_#18181b,_0px_1px_2px_0px_rgba(24,_24,_27,_30%)] transition-all duration-200"
                      title={expandedPanel === 'changes' ? "Minimize" : "Expand"}
                    >
                      {expandedPanel === 'changes' ? (
                        <Minimize2 className="h-4 w-4 text-white" />
                      ) : (
                        <Maximize2 className="h-4 w-4 text-white" />
                      )}
                    </Button>
                  </div>
                </div>
                {selectedWebsiteId && websites && (
                  <div className="flex items-center gap-2 text-sm bg-orange-100 text-orange-800 px-3 py-1 rounded-full inline-flex w-fit">
                    <span>Filtered:</span>
                    <span className="font-medium">
                      {websites.find(w => w._id === selectedWebsiteId)?.name || 'Unknown'}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedWebsiteId(null)
                        setChangesPage(1)
                      }}
                      className="ml-1 hover:text-orange-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                
                {/* Search Input */}
                <div className="mt-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <Input
                      type="text"
                      placeholder="Search changes by website name, title, or description..."
                      value={changesSearchQuery}
                      onChange={(e) => {
                        setChangesSearchQuery(e.target.value)
                        setChangesPage(1) // Reset to first page when searching
                      }}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              
              {/* Changes List */}
              <div className="min-h-[600px]">
                {(() => {
                  // Show loading state while scrape history is undefined
                  if (!allScrapeHistory) {
                    return (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-4" />
                        <p className="text-gray-500">Loading change history...</p>
                      </div>
                    )
                  }

                  // Filter changes based on selected website, filter, and search query
                  const filteredHistory = allScrapeHistory.filter(scrape => {
                    const websiteMatch = !selectedWebsiteId || scrape.websiteId === selectedWebsiteId;
                    const filterMatch = checkLogFilter === 'all' || 
                      (checkLogFilter === 'changed' && scrape.changeStatus === 'changed') ||
                      (checkLogFilter === 'meaningful' && scrape.aiAnalysis?.isMeaningfulChange === true);
                    
                    // Search filter
                    const searchMatch = !changesSearchQuery || 
                      scrape.websiteName?.toLowerCase().includes(changesSearchQuery.toLowerCase()) ||
                      scrape.title?.toLowerCase().includes(changesSearchQuery.toLowerCase()) ||
                      scrape.description?.toLowerCase().includes(changesSearchQuery.toLowerCase());
                    
                    return websiteMatch && filterMatch && searchMatch;
                  });
                  
                  // Pagination calculations for changes
                  const totalChangesPages = Math.ceil(filteredHistory.length / ITEMS_PER_PAGE_CHANGES)
                  const changesStartIndex = (changesPage - 1) * ITEMS_PER_PAGE_CHANGES
                  const changesEndIndex = changesStartIndex + ITEMS_PER_PAGE_CHANGES
                  const paginatedChanges = filteredHistory.slice(changesStartIndex, changesEndIndex)
                  
                  // Reset to page 1 if current page is out of bounds
                  if (changesPage > totalChangesPages && totalChangesPages > 0) {
                    setChangesPage(1)
                  }

                  if (filteredHistory.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-lg font-medium">No changes found</p>
                        {selectedWebsiteId ? (
                          <p className="text-sm mt-1">Select a different website or clear the filter</p>
                        ) : (
                          <p className="text-sm mt-1">Click on a website to filter changes</p>
                        )}
                      </div>
                    );
                  }

                  return (
                    <>
                      {paginatedChanges.map((scrape) => (
                    <div key={scrape._id} className="border-b hover:bg-gray-50">
                      <div className="p-3">
                        <div className="flex items-center gap-3">
                          {/* Website favicon */}
                          <div className="flex-shrink-0">
                            {scrape.websiteUrl && getFaviconUrl(scrape.websiteUrl) ? (
                              <img 
                                src={getFaviconUrl(scrape.websiteUrl)} 
                                alt={scrape.websiteName}
                                className="w-8 h-8 object-contain rounded bg-gray-50 p-1"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.parentElement!.innerHTML = '<div class="w-8 h-8 bg-gray-100 rounded flex items-center justify-center"><svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg></div>';
                                }}
                              />
                            ) : (
                              <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                                <Globe className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-sm truncate">{scrape.websiteName}</h4>
                              <span className="text-xs text-gray-500">• {formatTimeAgo(scrape.scrapedAt)}</span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">{scrape.websiteUrl}</p>
                          </div>

                          <div className="flex items-center gap-3 flex-shrink-0">
                            {scrape.aiAnalysis && (
                              <div className="relative group">
                                <Bot 
                                  className={`h-5 w-5 cursor-help ${
                                    scrape.aiAnalysis.isMeaningfulChange
                                      ? 'text-green-600'
                                      : 'text-red-500'
                                  }`}
                                />
                                <div className="absolute bottom-full right-0 mb-2 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 w-80">
                                  <div className="absolute -bottom-1 right-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                  <div className={`font-medium mb-1 ${scrape.aiAnalysis.isMeaningfulChange ? 'text-green-400' : 'text-red-400'}`}>
                                    {scrape.aiAnalysis.meaningfulChangeScore}% {scrape.aiAnalysis.isMeaningfulChange ? 'Meaningful' : 'Not Meaningful'}
                                  </div>
                                  <div className="text-gray-300 whitespace-normal">{scrape.aiAnalysis.reasoning}</div>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center gap-1">
                              {scrape.changeStatus === 'changed' && scrape.diff ? (
                                <Button
                                  variant="code"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewingSpecificScrape(scrape._id);
                                  }}
                                  className="w-7 h-7 p-0"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              ) : (
                                <div className="w-7 h-7"></div>
                              )}
                              {scrape.changeStatus !== 'checking' && (
                                <Button
                                  variant="code"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    downloadMarkdown(scrape.markdown, scrape.websiteName, scrape.scrapedAt)
                                  }}
                                  className="w-7 h-7 p-0"
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            <div className="w-20 flex justify-end">
                              <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 w-20 justify-center ${
                                scrape.changeStatus === 'changed' ? 'bg-orange-100 text-orange-800' :
                                scrape.changeStatus === 'checking' ? 'bg-blue-100 text-blue-800' :
                                scrape.changeStatus === 'new' ? 'bg-gray-100 text-gray-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {scrape.changeStatus === 'checking' && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                                {scrape.changeStatus}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                      
                      {/* Pagination Controls for Changes */}
                      {totalChangesPages > 1 && (
                        <div className="sticky bottom-0 bg-white border-t p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">
                              Page {changesPage} of {totalChangesPages}
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="orange"
                                size="sm"
                                onClick={() => setChangesPage(changesPage - 1)}
                                disabled={changesPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="orange"
                                size="sm"
                                onClick={() => setChangesPage(changesPage + 1)}
                                disabled={changesPage === totalChangesPages}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
        </div>
      </MainContent>
      
      {/* Expanded Panel Modal */}
      {expandedPanel && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 transition-opacity duration-300"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setExpandedPanel(null)
            }
          }}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                {expandedPanel === 'websites' ? 'Currently Tracked Websites' : 'Change Tracking Log'}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpandedPanel(null)}
                className="w-8 h-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Modal Content */}
            <div className="flex-1 overflow-hidden">
              {expandedPanel === 'websites' ? (
                // Websites expanded view - reuse the existing websites list logic
                <div className="h-full flex flex-col">
                  <div className="p-6 border-b">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {websites && (
                          <span className="text-sm text-gray-500">{websites.length} site{websites.length !== 1 ? 's' : ''}</span>
                        )}
                        {websites && websites.length > 0 && (
                          <Button
                            variant="orange"
                            size="sm"
                            onClick={async () => {
                              const activeWebsites = websites.filter(w => w.isActive && !w.isPaused);
                              for (const website of activeWebsites) {
                                await handleCheckNow(website._id);
                              }
                            }}
                            className="gap-2"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Check All
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        type="text"
                        placeholder="Search by name or URL..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                        disabled={!websites}
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {!websites ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-4" />
                        <p className="text-gray-500">Loading websites...</p>
                      </div>
                    ) : websites.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <Globe className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg font-medium mb-2">No websites tracked yet</p>
                        <p className="text-sm">Add a website URL above to start monitoring</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {websites.filter(website => {
                          const query = searchQuery.toLowerCase()
                          return website.name.toLowerCase().includes(query) || 
                                 website.url.toLowerCase().includes(query)
                        }).map((website) => {
                          const latestScrape = latestScrapes ? latestScrapes[website._id] : null;
                          const hasChanged = latestScrape?.changeStatus === 'changed';
                          const isProcessing = processingWebsites.has(website._id);
                          const isDeleting = deletingWebsites.has(website._id);
                          
                          return (
                            <div key={website._id} className="p-6 hover:bg-gray-50">
                              <div className="flex items-center gap-4">
                                {/* Website favicon */}
                                <div className="flex-shrink-0">
                                  {getFaviconUrl(website.url) ? (
                                    <img 
                                      src={getFaviconUrl(website.url)} 
                                      alt={website.name}
                                      className="w-12 h-12 object-contain rounded-lg bg-gray-50 p-2"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement!.innerHTML = '<div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center"><svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg></div>';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                      <Globe className="w-6 h-6 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-lg font-medium text-gray-900">{website.name}</h4>
                                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                                          website.monitorType === 'full_site' 
                                            ? 'bg-orange-100 text-orange-700' 
                                            : 'bg-gray-100 text-gray-700'
                                        }`}>
                                          {website.monitorType === 'full_site' ? 'Full Site' : 'Single Page'}
                                        </span>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                          website.isPaused 
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : website.isActive 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-gray-100 text-gray-500'
                                        }`}>
                                          {website.isPaused ? 'Paused' : website.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                      </div>
                                      <a 
                                        href={website.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                                      >
                                        {website.url}
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    </div>
                                    
                                    {/* Action buttons */}
                                    <div className="flex items-center gap-1">
                                      <Button 
                                        variant="default" 
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          pauseWebsite({ 
                                            websiteId: website._id, 
                                            isPaused: !website.isPaused 
                                          })
                                        }}
                                        title={website.isPaused ? "Resume monitoring" : "Pause monitoring"}
                                        className="w-8 h-8 p-0"
                                      >
                                        {website.isPaused ? (
                                          <Play className="h-4 w-4" />
                                        ) : (
                                          <Pause className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button 
                                        variant="default" 
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingWebsiteId(website._id)
                                          setShowWebhookModal(true)
                                        }}
                                        title="Settings"
                                        className="w-8 h-8 p-0"
                                      >
                                        <Settings2 className="h-4 w-4" />
                                      </Button>
                                      <Button 
                                        variant="default" 
                                        size="sm"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (confirm(`Are you sure you want to delete "${website.name}"? This action cannot be undone.`)) {
                                            setDeletingWebsites(prev => new Set([...prev, website._id]))
                                            try {
                                              await deleteWebsite({ websiteId: website._id })
                                            } catch (error) {
                                              console.error('Failed to delete website:', error)
                                              alert('Failed to delete website. Please try again.')
                                            } finally {
                                              setDeletingWebsites(prev => {
                                                const newSet = new Set(prev)
                                                newSet.delete(website._id)
                                                return newSet
                                              })
                                            }
                                          }
                                        }}
                                        title="Remove"
                                        className="w-8 h-8 p-0"
                                        disabled={isDeleting}
                                      >
                                        {isDeleting ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <X className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                  
                                  {/* Status info */}
                                  {(!website.isPaused && latestScrape) && (
                                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                                      <div className="flex items-center gap-3">
                                        {(newlyCreatedWebsites.has(website._id) || isProcessing) ? (
                                          <div className="flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            <span>{newlyCreatedWebsites.has(website._id) ? 'Setting up monitoring...' : 'Checking for changes...'}</span>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            {hasChanged ? (
                                              <>
                                                <div className="w-2 h-2 bg-orange-500 rounded-full" />
                                                <span>Changes detected</span>
                                              </>
                                            ) : (
                                              <>
                                                <div className="w-2 h-2 bg-green-500 rounded-full" />
                                                <span>No changes</span>
                                              </>
                                            )}
                                          </div>
                                        )}
                                        <span>Checked {formatTimeAgo(website.lastChecked)}</span>
                                        <span>Every {formatInterval(website.checkInterval)}</span>
                                      </div>
                                      <Button 
                                        variant="orange"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCheckNow(website._id)
                                        }}
                                        disabled={isProcessing}
                                        className="text-xs"
                                      >
                                        {isProcessing ? (
                                          <>
                                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                            {newlyCreatedWebsites.has(website._id) ? 'Setting up' : 'Checking'}
                                          </>
                                        ) : (
                                          <>
                                            <RefreshCw className="mr-1 h-3 w-3" />
                                            Check Now
                                          </>
                                        )}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                // Changes expanded view - reuse the existing changes list logic
                <div className="h-full flex flex-col">
                  <div className="p-6 border-b">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Button
                          variant={checkLogFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCheckLogFilter('all')}
                        >
                          All
                        </Button>
                        <Button
                          variant={checkLogFilter === 'changed' ? 'orange' : 'outline'}
                          size="sm"
                          onClick={() => setCheckLogFilter('changed')}
                        >
                          Changed Only
                        </Button>
                        <Button
                          variant={checkLogFilter === 'meaningful' ? 'orange' : 'outline'}
                          size="sm"
                          onClick={() => setCheckLogFilter('meaningful')}
                          className="flex items-center gap-1"
                        >
                          <Bot className="h-3 w-3" />
                          Meaningful
                        </Button>
                      </div>
                    </div>
                    {selectedWebsiteId && websites && (
                      <div className="flex items-center gap-2 text-sm bg-orange-100 text-orange-800 px-3 py-1 rounded-full inline-flex w-fit mb-4">
                        <span>Filtered:</span>
                        <span className="font-medium">
                          {websites.find(w => w._id === selectedWebsiteId)?.name || 'Unknown'}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedWebsiteId(null)
                            setChangesPage(1)
                          }}
                          className="ml-1 hover:text-orange-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                      </div>
                      <Input
                        type="text"
                        placeholder="Search changes by website name, title, or description..."
                        value={changesSearchQuery}
                        onChange={(e) => {
                          setChangesSearchQuery(e.target.value)
                          setChangesPage(1)
                        }}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {/* Changes list with filtering */}
                    <div className="divide-y">
                      {(() => {
                        if (!allScrapeHistory) {
                          return (
                            <div className="p-8 text-center">
                              <Loader2 className="h-8 w-8 animate-spin text-orange-500 mx-auto mb-4" />
                              <p className="text-gray-500">Loading change history...</p>
                            </div>
                          )
                        }
                        
                        // Apply filters
                        const filteredHistory = allScrapeHistory.filter(scrape => {
                          const websiteMatch = !selectedWebsiteId || scrape.websiteId === selectedWebsiteId;
                          const filterMatch = checkLogFilter === 'all' || 
                      (checkLogFilter === 'changed' && scrape.changeStatus === 'changed') ||
                      (checkLogFilter === 'meaningful' && scrape.aiAnalysis?.isMeaningfulChange === true);
                          const searchMatch = !changesSearchQuery || 
                            scrape.websiteName?.toLowerCase().includes(changesSearchQuery.toLowerCase()) ||
                            scrape.title?.toLowerCase().includes(changesSearchQuery.toLowerCase()) ||
                            scrape.description?.toLowerCase().includes(changesSearchQuery.toLowerCase());
                          return websiteMatch && filterMatch && searchMatch;
                        });
                        
                        return filteredHistory.map((scrape) => (
                          <div key={scrape._id} className="border-b hover:bg-gray-50">
                            <div className="p-3">
                              <div className="flex items-center gap-3">
                                {/* Website favicon */}
                                <div className="flex-shrink-0">
                                  {scrape.websiteUrl && getFaviconUrl(scrape.websiteUrl) ? (
                                    <img 
                                      src={getFaviconUrl(scrape.websiteUrl)} 
                                      alt={scrape.websiteName}
                                      className="w-8 h-8 object-contain rounded bg-gray-50 p-1"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement!.innerHTML = '<div class="w-8 h-8 bg-gray-100 rounded flex items-center justify-center"><svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg></div>';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                                      <Globe className="w-4 h-4 text-gray-400" />
                                    </div>
                                  )}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-sm truncate">{scrape.websiteName}</h4>
                                    <span className="text-xs text-gray-500">• {formatTimeAgo(scrape.scrapedAt)}</span>
                                  </div>
                                  <p className="text-xs text-gray-500 truncate">{scrape.websiteUrl}</p>
                                </div>

                                <div className="flex items-center gap-3 flex-shrink-0">
                                  {scrape.aiAnalysis && (
                                    <div className="relative group">
                                      <Bot 
                                        className={`h-5 w-5 cursor-help ${
                                          scrape.aiAnalysis.isMeaningfulChange
                                            ? 'text-green-600'
                                            : 'text-red-500'
                                        }`}
                                      />
                                      <div className="absolute bottom-full right-0 mb-2 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 w-80">
                                        <div className="absolute -bottom-1 right-2 w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                        <div className={`font-medium mb-1 ${scrape.aiAnalysis.isMeaningfulChange ? 'text-green-400' : 'text-red-400'}`}>
                                          {scrape.aiAnalysis.meaningfulChangeScore}% {scrape.aiAnalysis.isMeaningfulChange ? 'Meaningful' : 'Not Meaningful'}
                                        </div>
                                        <div className="text-gray-300 whitespace-normal">{scrape.aiAnalysis.reasoning}</div>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1">
                                    {scrape.changeStatus === 'changed' && scrape.diff ? (
                                      <Button
                                        variant="code"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingSpecificScrape(scrape._id);
                                        }}
                                        className="w-7 h-7 p-0"
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                    ) : (
                                      <div className="w-7 h-7"></div>
                                    )}
                                    {scrape.changeStatus !== 'checking' && (
                                      <Button
                                        variant="code"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          downloadMarkdown(scrape.markdown, scrape.websiteName, scrape.scrapedAt)
                                        }}
                                        className="w-7 h-7 p-0"
                                      >
                                        <Download className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="w-20 flex justify-end">
                                    <span className={`text-xs px-2 py-1 rounded flex items-center gap-1 w-20 justify-center ${
                                      scrape.changeStatus === 'changed' ? 'bg-orange-100 text-orange-800' :
                                      scrape.changeStatus === 'checking' ? 'bg-blue-100 text-blue-800' :
                                      scrape.changeStatus === 'new' ? 'bg-gray-100 text-gray-800' :
                                      'bg-gray-100 text-gray-800'
                                    }`}>
                                      {scrape.changeStatus === 'checking' && (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      )}
                                      {scrape.changeStatus}
                                    </span>
                                  </div>
                                </div>
                                </div>
                              </div>
                            </div>
                        ))
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Specific Diff Modal - Outside tab content */}
      {viewingSpecificScrape && allScrapeHistory && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setViewingSpecificScrape(null)
            }
          }}
        >
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            {(() => {
              const scrape = allScrapeHistory.find(s => s._id === viewingSpecificScrape);
              if (!scrape) return null;
              
              // Parse the diff text into lines
              const diffLines = scrape.diff?.text?.split('\n') || [];
              
              return (
                <>
                  <div className="p-6 border-b bg-gray-50">
                    <h3 className="text-xl font-semibold">Change Diff</h3>
                    <p className="text-sm text-zinc-600 mt-1">
                      {scrape.websiteName} • {formatTimeAgo(scrape.scrapedAt)}
                    </p>
                  </div>
                  <div className="overflow-y-auto max-h-[70vh] bg-gray-900">
                    {scrape.diff && scrape.diff.text ? (
                      <div className="p-4">
                        <div className="font-mono text-sm text-gray-100">
                          {diffLines.map((line, index) => {
                            const isAddition = line.startsWith('+') && !line.startsWith('+++');
                            const isDeletion = line.startsWith('-') && !line.startsWith('---');
                            const isContext = line.startsWith('@@');
                            const isFileHeader = line.startsWith('+++') || line.startsWith('---');
                            
                            // Filter based on checkboxes
                            if (onlyShowDiff && !isAddition && !isDeletion) return null;
                            if (!onlyShowDiff) {
                              if (isAddition && !showAddedLines) return null;
                              if (isDeletion && !showRemovedLines) return null;
                            }
                            
                            return (
                              <div
                                key={index}
                                className={`px-2 py-0.5 ${
                                  isAddition ? 'bg-green-900/30 text-green-400' :
                                  isDeletion ? 'bg-red-900/30 text-red-400' :
                                  isContext ? 'bg-gray-800/50 text-gray-300 font-bold' :
                                  isFileHeader ? 'text-gray-400' :
                                  'text-gray-200'
                                }`}
                              >
                                <span className="select-none text-gray-500 mr-2">
                                  {String(index + 1).padStart(4, ' ')}
                                </span>
                                <span className="break-all">{line || ' '}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-gray-400">No diff available for this change.</p>
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={onlyShowDiff}
                          onChange={(e) => setOnlyShowDiff(e.target.checked)}
                          className="h-4 w-4 text-orange-600 rounded focus:ring-orange-500"
                        />
                        <span className="text-orange-700">Only Show Diff</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showAddedLines}
                          onChange={(e) => setShowAddedLines(e.target.checked)}
                          className="h-4 w-4 text-green-600 rounded focus:ring-green-500"
                          disabled={onlyShowDiff}
                        />
                        <span className={`text-green-700 ${onlyShowDiff ? 'opacity-50' : ''}`}>Show Added</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showRemovedLines}
                          onChange={(e) => setShowRemovedLines(e.target.checked)}
                          className="h-4 w-4 text-red-600 rounded focus:ring-red-500"
                          disabled={onlyShowDiff}
                        />
                        <span className={`text-red-700 ${onlyShowDiff ? 'opacity-50' : ''}`}>Show Removed</span>
                      </label>
                    </div>
                    <Button variant="code" size="sm" onClick={() => setViewingSpecificScrape(null)}>
                      Close
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Webhook Configuration Modal */}
      {(editingWebsiteId || pendingWebsite) && (
        <WebhookConfigModal
          isOpen={showWebhookModal}
          onClose={() => {
            setShowWebhookModal(false)
            setEditingWebsiteId(null)
            setPendingWebsite(null)
          }}
          onSave={async (config) => {
            if (pendingWebsite) {
              // Create new website with configured settings
              setIsAdding(true)
              try {
                const websiteId = await createWebsite({
                  url: pendingWebsite.url,
                  name: pendingWebsite.name,
                  checkInterval: config.checkInterval || 60,
                  notificationPreference: config.notificationPreference,
                  webhookUrl: config.webhookUrl,
                  monitorType: config.monitorType,
                  crawlLimit: config.crawlLimit,
                  crawlDepth: config.crawlDepth
                })
                
                // Add to processing state to show initial setup is happening
                setProcessingWebsites(prev => new Set([...prev, websiteId]))
                setNewlyCreatedWebsites(prev => new Set([...prev, websiteId]))
                
                // If checkNow is true, trigger an immediate check
                if (config.checkNow) {
                  try {
                    await triggerScrape({ websiteId })
                  } catch (error) {
                    console.error('Failed to trigger initial check:', error)
                  }
                }
                
                // Remove from processing after initial setup time
                setTimeout(() => {
                  setProcessingWebsites(prev => {
                    const newSet = new Set(prev)
                    newSet.delete(websiteId)
                    return newSet
                  })
                  setNewlyCreatedWebsites(prev => {
                    const newSet = new Set(prev)
                    newSet.delete(websiteId)
                    return newSet
                  })
                }, config.monitorType === 'full_site' ? 15000 : 8000) // Longer for full site crawls
                
                setPendingWebsite(null)
              } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
                setError(error.message || 'Failed to add website')
              } finally {
                setIsAdding(false)
              }
            } else if (editingWebsiteId) {
              // Update existing website
              await updateWebsite({
                websiteId: editingWebsiteId as any, // eslint-disable-line @typescript-eslint/no-explicit-any
                notificationPreference: config.notificationPreference,
                webhookUrl: config.webhookUrl,
                checkInterval: config.checkInterval,
                monitorType: config.monitorType,
                crawlLimit: config.crawlLimit,
                crawlDepth: config.crawlDepth
              })
            }
            setShowWebhookModal(false)
            setEditingWebsiteId(null)
            setPendingWebsite(null)
          }}
          initialConfig={
            editingWebsiteId ? {
              notificationPreference: websites?.find(w => w._id === editingWebsiteId)?.notificationPreference || 'none',
              webhookUrl: websites?.find(w => w._id === editingWebsiteId)?.webhookUrl,
              checkInterval: websites?.find(w => w._id === editingWebsiteId)?.checkInterval || 60,
              monitorType: websites?.find(w => w._id === editingWebsiteId)?.monitorType || 'single_page',
              crawlLimit: websites?.find(w => w._id === editingWebsiteId)?.crawlLimit || 5,
              crawlDepth: websites?.find(w => w._id === editingWebsiteId)?.crawlDepth || 3
            } : {
              notificationPreference: 'none',
              checkInterval: 60,
              monitorType: 'single_page',
              crawlLimit: 5,
              crawlDepth: 3
            }
          }
          websiteName={pendingWebsite?.name || websites?.find(w => w._id === editingWebsiteId)?.name || 'Website'}
        />
      )}
      
      <Footer />
    </Layout>
  )
}