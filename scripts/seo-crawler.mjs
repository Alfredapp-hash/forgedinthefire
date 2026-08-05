#!/usr/bin/env node
/**
 * Thomas Marine SEO Crawler
 * Crawls the site and generates comprehensive SEO audit report
 */

import { JSDOM } from 'jsdom';
import fs from 'fs/promises';
import path from 'path';

const BASE_URL = (process.env.SITE_URL || 'https://forgedinthefireohio.org').replace(/\/$/, '');
const OUTPUT_DIR = path.join(process.cwd(), 'generated');

// Routes to crawl
const ROUTES = [
  '/',
  '/about',
  '/services',
  '/services/victim-advocacy',
  '/services/workforce-development',
  '/services/mentorship',
  '/services/community-education',
  '/services/accountability',
  '/services/housing',
  '/services/counseling',
  '/blog',
  '/careers',
  '/contact',
  '/donate',
  '/get-help',
  '/volunteer',
  '/resources',
  '/privacy',
  '/terms',
  '/accessibility',
];

class SEOCrawler {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.results = [];
    this.errors = [];
  }

  async crawl() {
    console.log(`🔍 Starting SEO crawl of ${this.baseUrl}\n`);
    
    for (const route of ROUTES) {
      try {
        const result = await this.crawlRoute(route);
        this.results.push(result);
        process.stdout.write('.');
      } catch (error) {
        this.errors.push({ route, error: error.message });
        process.stdout.write('✗');
      }
    }
    
    console.log('\n');
    return this.generateReport();
  }

  async crawlRoute(route) {
    const url = `${this.baseUrl}${route}`;
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ForgedInTheFire-SEO-Crawler/1.0'
        }
      });
      
      const loadTime = Date.now() - startTime;
      const html = await response.text();
      const dom = new JSDOM(html);
      const document = dom.window.document;

      return {
        route,
        url,
        status: response.status,
        loadTime,
        title: this.extractTitle(document),
        metaDescription: this.extractMetaDescription(document),
        metaKeywords: this.extractMetaKeywords(document),
        canonical: this.extractCanonical(document),
        ogTags: this.extractOpenGraph(document),
        twitterTags: this.extractTwitterCards(document),
        headings: this.extractHeadings(document),
        images: this.extractImages(document),
        links: this.extractLinks(document),
        schema: this.extractSchemaOrg(document),
        robots: this.extractRobotsMeta(document),
        lang: document.documentElement.lang || 'en',
        hasH1: !!document.querySelector('h1'),
        h1Count: document.querySelectorAll('h1').length,
        wordCount: this.countWords(document),
        internalLinks: this.countInternalLinks(document, route),
        externalLinks: this.countExternalLinks(document),
        hasFavicon: !!document.querySelector('link[rel="icon"]'),
        hasViewport: !!document.querySelector('meta[name="viewport"]'),
        hasCharset: !!document.querySelector('meta[charset]'),
      };
    } catch (error) {
      throw new Error(`Failed to crawl ${route}: ${error.message}`);
    }
  }

  extractTitle(doc) {
    const title = doc.querySelector('title');
    return title ? title.textContent.trim() : null;
  }

  extractMetaDescription(doc) {
    const meta = doc.querySelector('meta[name="description"]');
    return meta ? meta.getAttribute('content') : null;
  }

  extractMetaKeywords(doc) {
    const meta = doc.querySelector('meta[name="keywords"]');
    return meta ? meta.getAttribute('content') : null;
  }

  extractCanonical(doc) {
    const link = doc.querySelector('link[rel="canonical"]');
    return link ? link.getAttribute('href') : null;
  }

  extractOpenGraph(doc) {
    const tags = {};
    doc.querySelectorAll('meta[property^="og:"]').forEach(tag => {
      const property = tag.getAttribute('property');
      tags[property] = tag.getAttribute('content');
    });
    return tags;
  }

  extractTwitterCards(doc) {
    const tags = {};
    doc.querySelectorAll('meta[name^="twitter:"]').forEach(tag => {
      const name = tag.getAttribute('name');
      tags[name] = tag.getAttribute('content');
    });
    return tags;
  }

  extractHeadings(doc) {
    const headings = {};
    for (let i = 1; i <= 6; i++) {
      const elements = doc.querySelectorAll(`h${i}`);
      headings[`h${i}`] = Array.from(elements).map(h => ({
        text: h.textContent.trim(),
        id: h.id || null
      }));
    }
    return headings;
  }

  extractImages(doc) {
    return Array.from(doc.querySelectorAll('img')).map(img => ({
      src: img.getAttribute('src'),
      alt: img.getAttribute('alt') || null,
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
      hasAlt: !!img.getAttribute('alt'),
    }));
  }

  extractLinks(doc) {
    return Array.from(doc.querySelectorAll('a[href]')).map(a => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim(),
      isExternal: a.getAttribute('href')?.startsWith('http'),
    }));
  }

  extractSchemaOrg(doc) {
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    return Array.from(scripts).map(script => {
      try {
        return JSON.parse(script.textContent);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  extractRobotsMeta(doc) {
    const meta = doc.querySelector('meta[name="robots"]');
    return meta ? meta.getAttribute('content') : null;
  }

  countWords(doc) {
    const text = doc.body?.textContent || '';
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
  }

  countInternalLinks(doc) {
    const links = doc.querySelectorAll('a[href]');
    return Array.from(links).filter(a => {
      const href = a.getAttribute('href');
      return href && !href.startsWith('http') && !href.startsWith('#');
    }).length;
  }

  countExternalLinks(doc) {
    const links = doc.querySelectorAll('a[href^="http"]');
    return links.length;
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: this.baseUrl,
      totalRoutes: ROUTES.length,
      crawled: this.results.length,
      errors: this.errors.length,
      summary: this.generateSummary(),
      issues: this.identifyIssues(),
      recommendations: this.generateRecommendations(),
      routes: this.results,
      errorDetails: this.errors,
    };

    return report;
  }

  generateSummary() {
    const summary = {
      avgLoadTime: 0,
      missingTitles: [],
      missingDescriptions: [],
      missingH1: [],
      multipleH1: [],
      missingAltText: [],
      missingCanonical: [],
      missingOgImage: [],
      brokenPages: this.errors.map(e => e.route),
    };

    let totalLoadTime = 0;
    
    for (const route of this.results) {
      totalLoadTime += route.loadTime;
      
      if (!route.title) summary.missingTitles.push(route.route);
      if (!route.metaDescription) summary.missingDescriptions.push(route.route);
      if (!route.hasH1) summary.missingH1.push(route.route);
      if (route.h1Count > 1) summary.multipleH1.push(route.route);
      if (!route.canonical) summary.missingCanonical.push(route.route);
      if (!route.ogTags['og:image']) summary.missingOgImage.push(route.route);
      
      const imagesWithoutAlt = route.images.filter(img => !img.hasAlt);
      if (imagesWithoutAlt.length > 0) {
        summary.missingAltText.push({
          route: route.route,
          count: imagesWithoutAlt.length,
          images: imagesWithoutAlt.slice(0, 5).map(img => img.src)
        });
      }
    }

    summary.avgLoadTime = Math.round(totalLoadTime / this.results.length);
    return summary;
  }

  identifyIssues() {
    const issues = [];
    
    for (const route of this.results) {
      // Critical issues
      if (!route.title) {
        issues.push({ severity: 'critical', route: route.route, issue: 'Missing page title' });
      }
      if (!route.metaDescription) {
        issues.push({ severity: 'high', route: route.route, issue: 'Missing meta description' });
      }
      if (!route.hasH1) {
        issues.push({ severity: 'high', route: route.route, issue: 'Missing H1 heading' });
      }
      if (route.h1Count > 1) {
        issues.push({ severity: 'medium', route: route.route, issue: `Multiple H1 tags (${route.h1Count})` });
      }
      if (!route.canonical) {
        issues.push({ severity: 'medium', route: route.route, issue: 'Missing canonical URL' });
      }
      if (!route.ogTags['og:title']) {
        issues.push({ severity: 'low', route: route.route, issue: 'Missing Open Graph title' });
      }
      if (!route.ogTags['og:description']) {
        issues.push({ severity: 'low', route: route.route, issue: 'Missing Open Graph description' });
      }
      if (!route.ogTags['og:image']) {
        issues.push({ severity: 'low', route: route.route, issue: 'Missing Open Graph image' });
      }
      
      // Images without alt text
      const imagesWithoutAlt = route.images.filter(img => !img.hasAlt);
      if (imagesWithoutAlt.length > 0) {
        issues.push({ 
          severity: 'medium', 
          route: route.route, 
          issue: `${imagesWithoutAlt.length} images missing alt text` 
        });
      }
      
      // Performance
      if (route.loadTime > 3000) {
        issues.push({ severity: 'medium', route: route.route, issue: `Slow load time (${route.loadTime}ms)` });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  generateRecommendations() {
    const recs = [];
    const summary = this.generateSummary();
    
    if (summary.missingTitles.length > 0) {
      recs.push(`Add titles to ${summary.missingTitles.length} pages`);
    }
    if (summary.missingDescriptions.length > 0) {
      recs.push(`Add meta descriptions to ${summary.missingDescriptions.length} pages`);
    }
    if (summary.missingH1.length > 0) {
      recs.push(`Add H1 headings to ${summary.missingH1.length} pages`);
    }
    if (summary.multipleH1.length > 0) {
      recs.push(`Consolidate multiple H1 tags on ${summary.multipleH1.length} pages`);
    }
    if (summary.missingAltText.length > 0) {
      const totalImages = summary.missingAltText.reduce((sum, item) => sum + item.count, 0);
      recs.push(`Add alt text to ${totalImages} images across ${summary.missingAltText.length} pages`);
    }
    if (summary.avgLoadTime > 2000) {
      recs.push(`Optimize page load times (current avg: ${summary.avgLoadTime}ms)`);
    }
    
    return recs;
  }
}

async function main() {
  const crawler = new SEOCrawler(BASE_URL);
  const report = await crawler.crawl();
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Save full report
  const reportPath = path.join(OUTPUT_DIR, 'seo-audit-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  
  // Save human-readable summary
  const summaryPath = path.join(OUTPUT_DIR, 'seo-audit-summary.md');
  const summary = generateMarkdownSummary(report);
  await fs.writeFile(summaryPath, summary);
  
  console.log('\n✅ SEO Crawl Complete!\n');
  console.log(`📊 Full report: ${reportPath}`);
  console.log(`📝 Summary: ${summaryPath}\n`);
  
  // Print quick stats
  console.log('📈 Quick Stats:');
  console.log(`   Routes crawled: ${report.crawled}/${report.totalRoutes}`);
  console.log(`   Errors: ${report.errors}`);
  console.log(`   Critical issues: ${report.issues.filter(i => i.severity === 'critical').length}`);
  console.log(`   High priority: ${report.issues.filter(i => i.severity === 'high').length}`);
  console.log(`   Medium priority: ${report.issues.filter(i => i.severity === 'medium').length}`);
  console.log(`   Low priority: ${report.issues.filter(i => i.severity === 'low').length}`);
  console.log(`   Avg load time: ${report.summary.avgLoadTime}ms\n`);
}

function generateMarkdownSummary(report) {
  return `# Forged in the Fire SEO Audit Report

**Generated:** ${new Date(report.timestamp).toLocaleString()}  
**Site:** ${report.baseUrl}

## Summary

| Metric | Value |
|--------|-------|
| Routes Crawled | ${report.crawled}/${report.totalRoutes} |
| Errors | ${report.errors} |
| Avg Load Time | ${report.summary.avgLoadTime}ms |
| Missing Titles | ${report.summary.missingTitles.length} |
| Missing Descriptions | ${report.summary.missingDescriptions.length} |
| Missing H1 | ${report.summary.missingH1.length} |
| Multiple H1 | ${report.summary.multipleH1.length} |

## Issues by Severity

### Critical (${report.issues.filter(i => i.severity === 'critical').length})
${report.issues.filter(i => i.severity === 'critical').map(i => `- **${i.route}:** ${i.issue}`).join('\n') || 'None'}

### High Priority (${report.issues.filter(i => i.severity === 'high').length})
${report.issues.filter(i => i.severity === 'high').map(i => `- **${i.route}:** ${i.issue}`).join('\n') || 'None'}

### Medium Priority (${report.issues.filter(i => i.severity === 'medium').length})
${report.issues.filter(i => i.severity === 'high').length > 5 
  ? report.issues.filter(i => i.severity === 'medium').slice(0, 5).map(i => `- **${i.route}:** ${i.issue}`).join('\n') + '\n- ... and more'
  : report.issues.filter(i => i.severity === 'medium').map(i => `- **${i.route}:** ${i.issue}`).join('\n') || 'None'}

### Low Priority (${report.issues.filter(i => i.severity === 'low').length})
${report.issues.filter(i => i.severity === 'low').length > 5
  ? report.issues.filter(i => i.severity === 'low').slice(0, 5).map(i => `- **${i.route}:** ${i.issue}`).join('\n') + '\n- ... and more'
  : report.issues.filter(i => i.severity === 'low').map(i => `- **${i.route}:** ${i.issue}`).join('\n') || 'None'}

## Recommendations

${report.recommendations.map(r => `- [ ] ${r}`).join('\n') || 'None'}

## Error Details

${report.errorDetails.map(e => `- **${e.route}:** ${e.error}`).join('\n') || 'None'}

---

*Generated by Forged in the Fire SEO Crawler*
`;
}

main().catch(console.error);
