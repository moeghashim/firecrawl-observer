import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

// Analyze website changes using AI
export const analyzeChange = internalAction({
  args: {
    userId: v.id("users"),
    scrapeResultId: v.id("scrapeResults"),
    websiteName: v.string(),
    websiteUrl: v.string(),
    diff: v.object({
      text: v.string(),
      json: v.any(),
    }),
  },
  handler: async (ctx, args) => {
    // Get user's AI settings
    const userSettings = await ctx.runQuery(internal.userSettings.getUserSettingsInternal, {
      userId: args.userId,
    });

    if (!userSettings || !userSettings.aiAnalysisEnabled || !userSettings.aiApiKey) {
      console.log("AI analysis not enabled or API key not set for user:", args.userId);
      return;
    }

    const systemPrompt = userSettings.aiSystemPrompt || `You are an AI assistant specialized in analyzing website changes. Your task is to determine if a detected change is "meaningful" or just noise.

Meaningful changes include:
- Content updates (text, images, prices)
- New features or sections
- Important announcements
- Product availability changes
- Policy updates

NOT meaningful (ignore these):
- Rotating banners/carousels
- Dynamic timestamps
- View counters
- Session IDs
- Random promotional codes
- Cookie consent banners
- Advertising content
- Social media feed updates

Analyze the provided diff and return a JSON response with:
{
  "score": 0-100 (how meaningful the change is),
  "isMeaningful": true/false,
  "reasoning": "Brief explanation of your decision"
}`;

    try {
      // Use custom base URL if provided, otherwise default to OpenAI
      const baseUrl = userSettings.aiBaseUrl || "https://api.openai.com/v1";
      const model = userSettings.aiModel || "gpt-4o-mini";
      const isGPT5 = model.includes("gpt-5");

      let apiUrl, apiParams, response, data, messageContent;

      if (isGPT5) {
        // Use Responses API for GPT-5
        apiUrl = `${baseUrl.replace(/\/$/, '')}/responses`;
        apiParams = {
          model,
          reasoning: { effort: "medium" }, // Use medium effort for analysis tasks
          instructions: systemPrompt,
          input: `Website: ${args.websiteName} (${args.websiteUrl})
              
Changes detected:
${args.diff.text}

Please analyze these changes and determine if they are meaningful.`
        };

        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${userSettings.aiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apiParams),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("GPT-5 API error:", error);
          return;
        }

        data = await response.json();
        console.log("GPT-5 AI analysis response:", JSON.stringify(data, null, 2));

        // Use output_text convenience property or parse output array
        messageContent = data.output_text;
        if (!messageContent && data.output && data.output.length > 0) {
          const textOutput = data.output.find((item: any) => 
            item.content && item.content.some((c: any) => c.type === "output_text")
          );
          if (textOutput) {
            const textContent = textOutput.content.find((c: any) => c.type === "output_text");
            messageContent = textContent?.text;
          }
        }
      } else {
        // Use Chat Completions API for other models
        apiUrl = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
        apiParams = {
          model,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: `Website: ${args.websiteName} (${args.websiteUrl})
              
Changes detected:
${args.diff.text}

Please analyze these changes and determine if they are meaningful.`,
            },
          ],
          temperature: 0.3,
          max_completion_tokens: 500,
          response_format: { type: "json_object" },
        };

        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${userSettings.aiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apiParams),
        });

        if (!response.ok) {
          const error = await response.text();
          console.error("Chat API error:", error);
          return;
        }

        data = await response.json();
        console.log("Chat AI analysis response:", JSON.stringify(data, null, 2));
        
        // Check if response has the expected structure
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          console.error("Invalid AI response structure:", JSON.stringify(data));
          return;
        }
        
        messageContent = data.choices[0].message.content;
      }

      // Common validation for message content
      if (!messageContent) {
        console.error("Empty message content in AI response");
        return;
      }
      
      console.log("Message content to parse:", messageContent);
      
      let aiResponse;
      try {
        aiResponse = JSON.parse(messageContent);
      } catch (parseError) {
        console.error(`Failed to parse AI response as JSON: "${messageContent}". Parse error:`, parseError);
        return;
      }

      // Validate response structure
      if (typeof aiResponse.score !== "number" || 
          typeof aiResponse.isMeaningful !== "boolean" ||
          typeof aiResponse.reasoning !== "string") {
        console.error("Invalid AI response format:", aiResponse);
        return;
      }

      // Apply threshold
      const threshold = userSettings.aiMeaningfulChangeThreshold || 70;
      const isMeaningful = aiResponse.score >= threshold;

      // Update the scrape result with AI analysis
      await ctx.runMutation(internal.websites.updateScrapeResultAIAnalysis, {
        scrapeResultId: args.scrapeResultId,
        analysis: {
          meaningfulChangeScore: aiResponse.score,
          isMeaningfulChange: isMeaningful,
          reasoning: aiResponse.reasoning,
          analyzedAt: Date.now(),
          model: userSettings.aiModel || "gpt-4o-mini",
        },
      });

      console.log(`AI analysis complete for ${args.websiteName}: Score ${aiResponse.score}, Meaningful: ${isMeaningful}`);

      // Trigger AI-based notifications after analysis is complete
      await ctx.scheduler.runAfter(0, internal.aiAnalysis.handleAIBasedNotifications, {
        userId: args.userId,
        scrapeResultId: args.scrapeResultId,
        websiteName: args.websiteName,
        websiteUrl: args.websiteUrl,
        isMeaningful,
        diff: args.diff,
        aiAnalysis: {
          meaningfulChangeScore: aiResponse.score,
          isMeaningfulChange: isMeaningful,
          reasoning: aiResponse.reasoning,
          analyzedAt: Date.now(),
          model: userSettings.aiModel || "gpt-4o-mini",
        },
      });
    } catch (error) {
      console.error("Error in AI analysis:", error);
    }
  },
});

// Handle AI-based notifications after analysis is complete
export const handleAIBasedNotifications = internalAction({
  args: {
    userId: v.id("users"),
    scrapeResultId: v.id("scrapeResults"),
    websiteName: v.string(),
    websiteUrl: v.string(),
    isMeaningful: v.boolean(),
    diff: v.object({
      text: v.string(),
      json: v.any(),
    }),
    aiAnalysis: v.object({
      meaningfulChangeScore: v.number(),
      isMeaningfulChange: v.boolean(),
      reasoning: v.string(),
      analyzedAt: v.number(),
      model: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    try {
      // Get user settings to check notification filtering preferences
      const userSettings = await ctx.runQuery(internal.userSettings.getUserSettingsInternal, {
        userId: args.userId,
      });

      // Get website details for notifications
      const scrapeResult = await ctx.runQuery(internal.websites.getScrapeResult, {
        scrapeResultId: args.scrapeResultId,
      });

      if (!scrapeResult) {
        console.error("Scrape result not found for notifications");
        return;
      }

      const website = await ctx.runQuery(internal.websites.getWebsite, {
        websiteId: scrapeResult.websiteId,
        userId: args.userId,
      });

      if (!website || website.notificationPreference === "none") {
        return;
      }

      // Check if we should send webhook notification
      const shouldSendWebhook = (website.notificationPreference === "webhook" || website.notificationPreference === "both") && 
                               website.webhookUrl && 
                               (!userSettings?.webhookOnlyIfMeaningful || args.isMeaningful);

      // Check if we should send email notification
      const shouldSendEmail = (website.notificationPreference === "email" || website.notificationPreference === "both") && 
                             (!userSettings?.emailOnlyIfMeaningful || args.isMeaningful);

      // Send webhook notification if conditions are met
      if (shouldSendWebhook && website.webhookUrl) {
        await ctx.scheduler.runAfter(0, internal.notifications.sendWebhookNotification, {
          webhookUrl: website.webhookUrl,
          websiteId: scrapeResult.websiteId,
          websiteName: website.name,
          websiteUrl: args.websiteUrl,
          scrapeResultId: args.scrapeResultId,
          changeType: "content_changed",
          changeStatus: "changed",
          diff: args.diff,
          title: scrapeResult.title,
          description: scrapeResult.description,
          markdown: scrapeResult.markdown,
          scrapedAt: scrapeResult.scrapedAt,
          aiAnalysis: args.aiAnalysis,
        });
      }

      // Send email notification if conditions are met
      if (shouldSendEmail) {
        // Get user's email configuration
        const emailConfig = await ctx.runQuery(internal.emailManager.getEmailConfigInternal, {
          userId: args.userId,
        });
        
        if (emailConfig?.email && emailConfig.isVerified) {
          await ctx.scheduler.runAfter(0, internal.notifications.sendEmailNotification, {
            email: emailConfig.email,
            websiteName: website.name,
            websiteUrl: args.websiteUrl,
            changeType: "content_changed",
            changeStatus: "changed",
            diff: args.diff,
            title: scrapeResult.title,
            scrapedAt: scrapeResult.scrapedAt,
            userId: args.userId,
            aiAnalysis: args.aiAnalysis,
          });
        }
      }

      console.log(`AI-based notifications processed for ${args.websiteName}. Webhook: ${shouldSendWebhook}, Email: ${shouldSendEmail}`);
    } catch (error) {
      console.error("Error in AI-based notifications:", error);
    }
  },
});