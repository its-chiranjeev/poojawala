import { Test, TestingModule } from '@nestjs/testing';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

describe('ReviewController', () => {
  let controller: ReviewController;
  let mockReviewService: any;

  beforeEach(async () => {
    mockReviewService = {
      create: jest.fn(),
      findAll: jest.fn(),
      getAllCustomerReviews: jest.fn(),
      findOne: jest.fn(),
      updateStatus: jest.fn(),
      remove: jest.fn(),
      getPurohitOverallRating: jest.fn(),
      getAstrologerOverallRating: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReviewController],
      providers: [
        { provide: ReviewService, useValue: mockReviewService },
      ],
    }).compile();

    controller = module.get<ReviewController>(ReviewController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
