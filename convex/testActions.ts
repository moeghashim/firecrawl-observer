import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { requireCurrentUserForAction } from "./helpers";
import { api, internal } from "./_generated/api";
import { resend } from "./alertEmail";
import { sanitizeHtml } from "./lib/sanitize";

// Test AI model connection
export const testAIModel = action({
  handler: async (ctx): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    model?: string;
    responseModel?: string;
    baseUrl?: string;
  }> => {
    const user = await requireCurrentUserForAction(ctx);
    
    // Get user settings
    const userSettings: any = await ctx.runQuery(api.userSettings.getUserSettings);
    
    if (!userSettings?.aiApiKey) {
      throw new Error("No API key configured");
    }
    
    if (!userSettings.aiAnalysisEnabled) {
      throw new Error("AI analysis is not enabled");
    }
    
    const baseUrl = userSettings.aiBaseUrl || "https://api.openai.com/v1";
    const model = userSettings.aiModel || "gpt-4o-mini";
    const isGPT5 = model.includes("gpt-5");
    
    try {
      let apiUrl, apiParams, response, data, messageContent;

      if (isGPT5) {
        // Use Responses API for GPT-5
        apiUrl = `${baseUrl.replace(/\/$/, '')}/responses`;
        apiParams = {
          model,
          reasoning: { effort: "low" },
          instructions: "You are a helpful assistant. Please respond with a simple JSON object.",
          input: "Please respond with a JSON object containing: { \"status\": \"success\", \"message\": \"Connection successful\", \"model\": \"<the model you are>\" }"
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
          throw new Error(`API error: ${response.status} - ${error}`);
        }

        data = await response.json();
        console.log("GPT-5 API response:", JSON.stringify(data, null, 2));

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
              content: "You are a helpful assistant. Please respond with a simple JSON object.",
            },
            {
              role: "user",
              content: "Please respond with a JSON object containing: { \"status\": \"success\", \"message\": \"Connection successful\", \"model\": \"<the model you are>\" }",
            },
          ],
          temperature: 0.3,
          max_completion_tokens: 100,
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
          throw new Error(`API error: ${response.status} - ${error}`);
        }

        data = await response.json();
        console.log("Chat API response:", JSON.stringify(data, null, 2));

        // Check if response has the expected structure
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
          throw new Error(`Invalid API response structure: ${JSON.stringify(data)}`);
        }

        messageContent = data.choices[0].message.content;
      }
      
      // Common validation for message content
      if (!messageContent) {
        throw new Error("Empty message content in API response");
      }
      
      console.log("Message content to parse:", messageContent);
      
      let result;
      try {
        result = JSON.parse(messageContent);
      } catch (parseError) {
        throw new Error(`Failed to parse AI response as JSON: "${messageContent}". Parse error: ${parseError}`);
      }
      
      return {
        success: true,
        message: result.message || "Connection successful",
        model: userSettings.aiModel,
        responseModel: result.model,
        baseUrl: baseUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message || "Failed to connect to AI model",
        model: userSettings.aiModel,
        baseUrl: baseUrl,
      };
    }
  },
});

// Test email sending
export const testEmailSending = action({
  handler: async (ctx): Promise<{
    success: boolean;
    message: string;
  }> => {
    const user = await requireCurrentUserForAction(ctx);
    
    // Get user's email config
    const emailConfig: any = await ctx.runQuery(api.emailManager.getEmailConfig);
    
    if (!emailConfig?.email) {
      throw new Error("No email configured");
    }
    
    if (!emailConfig.isVerified) {
      throw new Error("Email is not verified");
    }
    
    // Get user settings for template
    const userSettings = await ctx.runQuery(api.userSettings.getUserSettings);
    
    // Schedule the test email
    await ctx.scheduler.runAfter(0, internal.testActions.sendTestEmailInternal, {
      email: emailConfig.email,
      userId: user,
      emailTemplate: userSettings?.emailTemplate || undefined,
    });
    
    return {
      success: true,
      message: `Test email sent to ${emailConfig.email}`,
    };
  },
});

// Internal action to send test email
export const sendTestEmailInternal = internalAction({
  args: {
    email: v.string(),
    userId: v.id("users"),
    emailTemplate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let htmlContent = '';
    
    if (args.emailTemplate) {
      // Use custom template with test data
      let processedTemplate = args.emailTemplate
        .replace(/{{websiteName}}/g, 'Example Website (Test)')
        .replace(/{{websiteUrl}}/g, 'https://example.com')
        .replace(/{{changeDate}}/g, new Date().toLocaleString())
        .replace(/{{changeType}}/g, 'Content changed')
        .replace(/{{pageTitle}}/g, 'Test Page Title')
        .replace(/{{viewChangesUrl}}/g, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')
        .replace(/{{aiMeaningfulScore}}/g, '85')
        .replace(/{{aiIsMeaningful}}/g, 'Yes')
        .replace(/{{aiReasoning}}/g, 'This is a test email to verify your email template is working correctly.')
        .replace(/{{aiModel}}/g, 'gpt-4o-mini')
        .replace(/{{aiAnalyzedAt}}/g, new Date().toLocaleString());
      
      // Sanitize the HTML
      htmlContent = sanitizeHtml(processedTemplate);
    } else {
      // Use default test template
      htmlContent = `
        <h2>Test Email - Firecrawl Observer</h2>
        <p>This is a test email to verify your email configuration is working correctly.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h3>Test Configuration</h3>
          <p><strong>Email:</strong> ${args.email}</p>
          <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
          <p><strong>Status:</strong> ✅ Email delivery is working!</p>
        </div>
        <p>If you received this email, your email notifications are configured correctly.</p>
      `;
    }
    
    await resend.sendEmail(ctx, {
      from: `${process.env.APP_NAME || 'Firecrawl Observer'} <${process.env.FROM_EMAIL || 'noreply@example.com'}>`,
      to: args.email,
      subject: "Test Email - Firecrawl Observer",
      html: htmlContent,
    });
  },
});