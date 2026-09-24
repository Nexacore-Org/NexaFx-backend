import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import { OpenidConnectService } from './openid-connect.service';
import { AuthorizeRequestDto, TokenRequestDto } from './dto/openid-connect.dto';
import { Response } from 'express';

@Controller('oidc')
export class OpenidConnectController {
  constructor(private readonly oidcService: OpenidConnectService) {}

  @Get('authorize')
  authorize(@Query() query: AuthorizeRequestDto, @Res() res: Response) {
    // In a real flow, this would check if user is logged in, show consent screen, etc.
    // For now, assume mocked user consent
    const code = this.oidcService.generateAuthorizationCode(query, 'user-1234');
    
    let redirectUrl = `${query.redirect_uri}?code=${code}`;
    if (query.state) {
      redirectUrl += `&state=${query.state}`;
    }
    
    return res.redirect(redirectUrl);
  }

  @Post('token')
  token(@Body() body: TokenRequestDto) {
    if (body.grant_type !== 'authorization_code') {
      throw new Error('Unsupported grant type');
    }
    
    return this.oidcService.exchangeCodeForTokens(body);
  }
}
